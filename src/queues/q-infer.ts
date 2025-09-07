/**
 * Infer Queue Processor
 * 
 * Handles AI inference using the configured LLM.
 * Receives context from retrieve queue and generates
 * intelligent responses using the agent's configuration.
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../index";
import type { InferQueueMessage, ReplyQueueMessage, JobStatus } from "./types";
import { ManualInterventionController } from "../services/manual-intervention";
import { AIHubMixClient } from "../services/aihubmix";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import * as schema from "../../database/schema";

/**
 * Build the system prompt with context
 */
function buildSystemPrompt(
  agentPrompt: string,
  context: InferQueueMessage['context']
): string {
  if (!context || context.length === 0) {
    return agentPrompt;
  }
  
  // Build context section
  const contextSection = context
    .map((chunk, idx) => `[${idx + 1}] ${chunk.text}`)
    .join('\n\n');
  
  return `${agentPrompt}

## Relevant Information
The following information may be helpful for answering the user's question:

${contextSection}

Please use this information to provide accurate and helpful responses. If the information doesn't directly answer the question, you can still use your general knowledge while prioritizing the provided context when relevant.`;
}

/**
 * Format chat history for the LLM
 */
function formatChatHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  
  // Add history (limit to last 10 exchanges to control context size)
  const recentHistory = history.slice(-20); // Last 10 exchanges (user + assistant)
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  }
  
  // Add current user message
  messages.push({
    role: 'user',
    content: currentMessage
  });
  
  return messages;
}

export async function handleInferQueue(
  batch: MessageBatch<InferQueueMessage>,
  env: Env
): Promise<void> {
  const db = drizzle(env.DB, { schema });
  const interventionController = new ManualInterventionController(env);
  
  console.log(`[q_infer] Processing batch of ${batch.messages.length} messages`);
  
  for (const message of batch.messages) {
    const startTime = Date.now();
    const {
      chatKey,
      userMessage,
      context,
      agentConfig,
      chatHistory,
      timestamp,
      turn,
      sessionId
    } = message.body;
    
    try {
      console.log(`[q_infer] Processing inference for chat: ${chatKey}, turn: ${turn}`);
      
      // Create job record
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(schema.jobs).values({
        id: jobId,
        chatKey,
        turn,
        stage: 'infer',
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Double-check intervention status
      const interventionStatus = await interventionController.shouldAutoReply(chatKey);
      if (!interventionStatus.shouldAutoReply) {
        console.log(`[q_infer] Auto-reply disabled for ${chatKey}: ${interventionStatus.reason}`);
        
        // Mark job as suppressed
        await db
          .update(schema.jobs)
          .set({ 
            status: 'suppressed' as JobStatus,
            updatedAt: new Date(),
            metadata: JSON.stringify({ reason: interventionStatus.reason })
          })
          .where(eq(schema.jobs.id, jobId));
        
        // Store the user message without generating a response
        await db.insert(schema.messages).values({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chatKey,
          turn,
          role: 'user',
          text: userMessage,
          status: 'suppressed',
          timestamp: BigInt(timestamp)
        });
        
        message.ack();
        continue;
      }
      
      // Get user for AIHubMix key
      const [userId] = chatKey.split(':');
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId)
      });
      
      if (!user?.aihubmixKey) {
        console.error(`[q_infer] No AIHubMix key for user: ${userId}`);
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            error: 'No AIHubMix key configured',
            updatedAt: new Date()
          })
          .where(eq(schema.jobs.id, jobId));
        message.retry();
        continue;
      }
      
      // Initialize AI client
      const aiClient = new AIHubMixClient(user.aihubmixKey, env);
      
      // Build system prompt with context
      const systemPrompt = buildSystemPrompt(agentConfig.systemPrompt, context);
      
      // Format messages for the LLM
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...formatChatHistory(chatHistory, userMessage)
      ];
      
      console.log(`[q_infer] Calling ${agentConfig.model} with ${messages.length} messages`);
      
      // Call the LLM
      const response = await aiClient.chat(messages, {
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        maxTokens: agentConfig.maxTokens
      });
      
      if (!response.choices?.[0]?.message?.content) {
        throw new Error('No response from AI model');
      }
      
      const aiResponse = response.choices[0].message.content;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      console.log(`[q_infer] Generated response (${aiResponse.length} chars, ${tokensUsed} tokens)`);
      
      // Store messages in database
      const messageIds = await db.batch([
        // Store user message
        db.insert(schema.messages).values({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chatKey,
          turn,
          role: 'user',
          text: userMessage,
          status: 'completed',
          timestamp: BigInt(timestamp)
        }),
        // Store AI response
        db.insert(schema.messages).values({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chatKey,
          turn: turn + 1,
          role: 'assistant',
          text: aiResponse,
          status: 'pending', // Will be marked as 'sent' after reply queue
          timestamp: BigInt(Date.now())
        })
      ]);
      
      // Update conversation turn
      await db
        .update(schema.conversations)
        .set({ 
          lastTurn: turn + 1,
          updatedAt: new Date()
        })
        .where(eq(schema.conversations.chatKey, chatKey));
      
      // Extract WhatsApp IDs from chatKey
      const [, waAccountId, whatsappChatId] = chatKey.split(':');
      
      // Prepare message for reply queue
      const replyMessage: ReplyQueueMessage = {
        chatKey,
        aiResponse,
        userMessage,
        timestamp: Date.now(),
        turn: turn + 1,
        sessionId,
        waAccountId,
        whatsappChatId,
        metadata: {
          inferenceTime: Date.now() - startTime,
          tokensUsed,
          model: agentConfig.model,
          agentId: agentConfig.id
        }
      };
      
      // Send to reply queue
      await env.QUEUE_REPLY.send(replyMessage);
      
      // Update job status
      await db
        .update(schema.jobs)
        .set({ 
          status: 'completed' as JobStatus,
          updatedAt: new Date(),
          metadata: JSON.stringify({
            processingTime: Date.now() - startTime,
            tokensUsed,
            responseLength: aiResponse.length,
            contextChunks: context.length
          })
        })
        .where(eq(schema.jobs.id, jobId));
      
      console.log(`[q_infer] Successfully processed inference for ${chatKey} in ${Date.now() - startTime}ms`);
      
      // ACK the message
      message.ack();
      
    } catch (error) {
      console.error(`[q_infer] Error processing inference for ${chatKey}:`, error);
      
      // Update job status
      try {
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date()
          })
          .where(and(
            eq(schema.jobs.chatKey, chatKey),
            eq(schema.jobs.turn, turn),
            eq(schema.jobs.stage, 'infer')
          ));
      } catch (dbError) {
        console.error(`[q_infer] Failed to update job status:`, dbError);
      }
      
      // Retry the message
      message.retry();
    }
  }
}