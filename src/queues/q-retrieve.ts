/**
 * Retrieve Queue Processor
 * 
 * Handles knowledge base retrieval using vector search.
 * Receives merged messages from ChatSessionDO and finds
 * relevant context from the knowledge base.
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../index";
import type { RetrieveQueueMessage, InferQueueMessage, JobStatus } from "./types";
import { ManualInterventionController } from "../services/manual-intervention";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../../database/schema";
import { AIHubMixClient } from "../services/aihubmix";

export async function handleRetrieveQueue(
  batch: MessageBatch<RetrieveQueueMessage>,
  env: Env
): Promise<void> {
  const db = drizzle(env.DB, { schema });
  const interventionController = new ManualInterventionController(env);
  
  console.log(`[q_retrieve] Processing batch of ${batch.messages.length} messages`);
  
  for (const message of batch.messages) {
    const startTime = Date.now();
    const { chatKey, mergedText, timestamp, turn, sessionId, agentId, metadata } = message.body;
    
    try {
      console.log(`[q_retrieve] Processing message for chat: ${chatKey}, turn: ${turn}`);
      
      // Create job record
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await db.insert(schema.jobs).values({
        id: jobId,
        chatKey,
        turn,
        stage: 'retrieve',
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Check if auto-reply is enabled (intervention check)
      const interventionStatus = await interventionController.shouldAutoReply(chatKey);
      if (!interventionStatus.shouldAutoReply) {
        console.log(`[q_retrieve] Auto-reply disabled for ${chatKey}: ${interventionStatus.reason}`);
        
        // Mark job as suppressed
        await db
          .update(schema.jobs)
          .set({ 
            status: 'suppressed' as JobStatus,
            updatedAt: new Date(),
            payload: JSON.stringify({ reason: interventionStatus.reason })
          })
          .where(eq(schema.jobs.id, jobId));
        
        // ACK the message without further processing
        message.ack();
        continue;
      }
      
      // Get agent configuration and knowledge bases
      let agent;
      if (agentId) {
        agent = await db.query.agents.findFirst({
          where: eq(schema.agents.id, agentId),
          with: {
            knowledgeBases: true
          }
        });
      }
      
      if (!agent) {
        // Try to find any agent for user
        const userId = metadata?.userId || chatKey.split(':')[0];
        if (userId) {
          agent = await db.query.agents.findFirst({
            where: eq(schema.agents.userId, userId),
            with: {
              knowledgeBases: true
            }
          });
        }
      }
      
      if (!agent) {
        console.error(`[q_retrieve] No agent found for chat: ${chatKey}`);
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            errorMessage: 'No agent configured',
            updatedAt: new Date()
          })
          .where(eq(schema.jobs.id, jobId));
        message.retry();
        continue;
      }
      
      // Get user's AIHubMix key
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, agent.userId)
      });
      
      if (!user?.aihubmixKey) {
        console.error(`[q_retrieve] No AIHubMix key for user: ${agent.userId}`);
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            errorMessage: 'No AIHubMix key configured',
            updatedAt: new Date()
          })
          .where(eq(schema.jobs.id, jobId));
        message.retry();
        continue;
      }
      
      // Initialize AIHubMix client with proper configuration
      const aiClient = new AIHubMixClient(user.aihubmixKey, {
        encryptionSecret: env.ENCRYPTION_KEY || undefined,
        kv: env.KV
      });
      
      // Generate embedding for the user's message
      console.log(`[q_retrieve] Generating embedding for query: "${mergedText.substring(0, 50)}..."`);
      const embeddingResponse = await aiClient.createEmbeddings({
        input: [mergedText],
        model: 'text-embedding-3-small'
      });
      
      if (!embeddingResponse.data?.[0]?.embedding) {
        throw new Error('Failed to generate embedding');
      }
      
      const queryVector = embeddingResponse.data[0].embedding;
      
      // Get knowledge base IDs from agent configuration
      const agentKbLinks = await db.query.agentKbLinks.findMany({
        where: eq(schema.agentKbLinks.agentId, agent.id),
        with: {
          knowledgeBase: true
        }
      });
      
      const kbIds = agentKbLinks
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map(link => link.kbId);
      
      // Perform vector search
      let relevantChunks: Array<{
        text: string;
        score: number;
        metadata?: any;
      }> = [];
      
      if (kbIds.length > 0) {
        console.log(`[q_retrieve] Searching ${kbIds.length} knowledge bases`);
        
        // Query Vectorize for similar chunks
        // Note: Vectorize currently doesn't support complex filters, so we search one KB at a time
        const allMatches = [];
        for (const kbId of kbIds.slice(0, 3)) { // Limit to top 3 KBs for performance
          try {
            const vectorResults = await env.VECTORIZE.query(queryVector, {
              topK: 5,
              filter: {
                kb_id: kbId
              },
              returnMetadata: true
            });
            
            if (vectorResults.matches) {
              allMatches.push(...vectorResults.matches);
            }
          } catch (error) {
            console.warn(`[q_retrieve] Failed to search KB ${kbId}:`, error);
          }
        }
        
        // Sort all matches by score and take top K
        allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
        const topMatches = allMatches.slice(0, 8);
        
        // Fetch chunk texts from D1
        if (topMatches.length > 0) {
          const chunkIds = topMatches.map(m => m.id);
          const chunks = await db.query.kbChunks.findMany({
            where: inArray(schema.kbChunks.vectorId, chunkIds)
          });
          
          // Map chunks with scores
          relevantChunks = topMatches.map(match => {
            const chunk = chunks.find(c => c.vectorId === match.id);
            return {
              text: chunk?.text || '',
              score: match.score || 0,
              metadata: {
                kbId: chunk?.kbId,
                docId: chunk?.docId,
                chunkIndex: chunk?.chunkIndex
              }
            };
          }).filter(c => c.text); // Filter out empty chunks
        }
        
        console.log(`[q_retrieve] Found ${relevantChunks.length} relevant chunks`);
      }
      
      // Get chat history (last 10 messages)
      const chatHistory = await db.query.messages.findMany({
        where: eq(schema.messages.chatKey, chatKey),
        orderBy: (messages, { desc }) => [desc(messages.turn)],
        limit: 10
      });
      
      // Reverse to get chronological order
      const formattedHistory = chatHistory
        .reverse()
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.text
        }));
      
      // Prepare message for infer queue
      const inferMessage: InferQueueMessage = {
        chatKey,
        userMessage: mergedText,
        context: relevantChunks,
        agentConfig: {
          id: agent.id,
          name: agent.name,
          systemPrompt: agent.promptSystem || '',
          model: agent.model || 'gpt-4o-mini',
          temperature: agent.temperature || 0.7,
          maxTokens: agent.maxTokens || 1000
        },
        chatHistory: formattedHistory,
        timestamp,
        turn,
        sessionId
      };
      
      // Send to infer queue
      await env.QUEUE_INFER.send(inferMessage);
      
      // Update job status
      await db
        .update(schema.jobs)
        .set({ 
          status: 'completed' as JobStatus,
          updatedAt: new Date(),
          result: JSON.stringify({
            processingTime: Date.now() - startTime,
            chunksFound: relevantChunks.length,
            kbsSearched: kbIds.length
          })
        })
        .where(eq(schema.jobs.id, jobId));
      
      console.log(`[q_retrieve] Successfully processed message for ${chatKey} in ${Date.now() - startTime}ms`);
      
      // ACK the message
      message.ack();
      
    } catch (error) {
      console.error(`[q_retrieve] Error processing message for ${chatKey}:`, error);
      
      // Update job status
      try {
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date()
          })
          .where(and(
            eq(schema.jobs.chatKey, chatKey),
            eq(schema.jobs.turn, turn),
            eq(schema.jobs.stage, 'retrieve')
          ));
      } catch (dbError) {
        console.error(`[q_retrieve] Failed to update job status:`, dbError);
      }
      
      // Retry the message
      message.retry();
    }
  }
}