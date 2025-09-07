/**
 * Reply Queue Processor
 * 
 * Handles humanized message sending via WAHA API.
 * Receives AI-generated responses and sends them with
 * typing indicators, delays, and message segmentation.
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../index";
import type { ReplyQueueMessage, JobStatus } from "./types";
import { ManualInterventionController, safeTrim } from "../services/manual-intervention";
import { WAHAClient } from "../services/waha";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import * as schema from "../../database/schema";

/**
 * Split long messages into segments for more natural conversation
 */
function splitMessage(text: string, maxLength = 1000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const segments: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let currentSegment = '';
  
  for (const sentence of sentences) {
    if ((currentSegment + sentence).length > maxLength && currentSegment) {
      segments.push(currentSegment.trim());
      currentSegment = sentence;
    } else {
      currentSegment += sentence;
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment.trim());
  }
  
  return segments;
}

/**
 * Generate a random delay for more human-like responses
 */
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleReplyQueue(
  batch: MessageBatch<ReplyQueueMessage>,
  env: Env
): Promise<void> {
  const db = drizzle(env.DB, { schema });
  const interventionController = new ManualInterventionController(env);
  
  console.log(`[q_reply] Processing batch of ${batch.messages.length} messages`);
  
  for (const message of batch.messages) {
    const startTime = Date.now();
    const {
      chatKey,
      aiResponse,
      userMessage,
      timestamp,
      turn,
      sessionId,
      waAccountId,
      whatsappChatId,
      metadata
    } = message.body;
    
    try {
      console.log(`[q_reply] Processing reply for chat: ${chatKey}, turn: ${turn}`);
      
      // Create job record
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await db.insert(schema.jobs).values({
        id: jobId,
        chatKey,
        turn,
        stage: 'reply',
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Final intervention check before sending
      const interventionStatus = await interventionController.shouldAutoReply(chatKey);
      if (!interventionStatus.shouldAutoReply) {
        console.log(`[q_reply] Auto-reply disabled for ${chatKey}: ${interventionStatus.reason}`);
        
        // Mark job as suppressed
        await db
          .update(schema.jobs)
          .set({ 
            status: 'suppressed' as JobStatus,
            updatedAt: new Date(),
            payload: JSON.stringify({ 
              reason: interventionStatus.reason,
              suppressedResponse: aiResponse 
            })
          })
          .where(eq(schema.jobs.id, jobId));
        
        // Update message status to suppressed
        await db
          .update(schema.messages)
          .set({ 
            status: 'suppressed'
          })
          .where(and(
            eq(schema.messages.chatKey, chatKey),
            eq(schema.messages.turn, turn),
            eq(schema.messages.role, 'assistant')
          ));
        
        message.ack();
        continue;
      }
      
      // Get WhatsApp session information
      const waSession = await db.query.waSessions.findFirst({
        where: eq(schema.waSessions.waAccountId, waAccountId)
      });
      
      if (!waSession) {
        console.error(`[q_reply] No WhatsApp session found for account: ${waAccountId}`);
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            errorMessage: 'WhatsApp session not found',
            updatedAt: new Date()
          })
          .where(eq(schema.jobs.id, jobId));
        message.retry();
        continue;
      }
      
      // Get WAHA configuration from WhatsApp accounts
      const waAccount = await db.query.waAccounts.findFirst({
        where: eq(schema.waAccounts.id, waAccountId)
      });
      
      if (!waAccount?.wahaApiUrl || !waAccount?.wahaApiKey) {
        console.error(`[q_reply] No WAHA configuration for account: ${waAccountId}`);
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            errorMessage: 'WAHA configuration not found',
            updatedAt: new Date()
          })
          .where(eq(schema.jobs.id, jobId));
        message.retry();
        continue;
      }
      
      // Initialize WAHA client
      const wahaClient = new WAHAClient(
        waAccount.wahaApiUrl,
        waAccount.wahaApiKey,
        env.ENCRYPTION_KEY || ''
      );
      
      // Apply safety trim to prevent accidental intervention triggers
      const safeResponse = safeTrim(aiResponse);
      
      // Split message into segments for natural conversation
      const segments = splitMessage(safeResponse);
      
      console.log(`[q_reply] Sending ${segments.length} message segments to ${whatsappChatId}`);
      
      let allSegmentsSent = true;
      const sentSegments: string[] = [];
      
      for (let i = 0; i < segments.length; i++) {
        try {
          // Send typing indicator
          await wahaClient.startTyping(sessionId, whatsappChatId);
          
          // Simulate typing time (50-100ms per character)
          const typingDuration = randomDelay(
            segments[i].length * 50,
            segments[i].length * 100
          );
          await sleep(Math.min(typingDuration, 5000)); // Cap at 5 seconds
          
          // Stop typing
          await wahaClient.stopTyping(sessionId, whatsappChatId);
          
          // Small pause before sending
          await sleep(randomDelay(300, 800));
          
          // Send the message segment
          const sendResult = await wahaClient.sendText(
            sessionId,
            whatsappChatId,
            segments[i]
          );
          
          if (!sendResult.success) {
            throw new Error(`Failed to send segment ${i + 1}: ${sendResult.error}`);
          }
          
          sentSegments.push(segments[i]);
          console.log(`[q_reply] Sent segment ${i + 1}/${segments.length}`);
          
          // Pause between segments
          if (i < segments.length - 1) {
            await sleep(randomDelay(1000, 2000));
          }
          
        } catch (error) {
          console.error(`[q_reply] Failed to send segment ${i + 1}:`, error);
          allSegmentsSent = false;
          break;
        }
      }
      
      if (!allSegmentsSent && sentSegments.length === 0) {
        // No segments were sent, retry the whole message
        await db
          .update(schema.jobs)
          .set({ 
            status: 'failed' as JobStatus,
            errorMessage: 'Failed to send any message segments',
            updatedAt: new Date()
          })
          .where(eq(schema.jobs.id, jobId));
        
        message.retry();
        continue;
      }
      
      // Update message status in database
      await db
        .update(schema.messages)
        .set({ 
          status: allSegmentsSent ? 'sent' : 'partial',
          text: sentSegments.join('\n\n') // Store what was actually sent
        })
        .where(and(
          eq(schema.messages.chatKey, chatKey),
          eq(schema.messages.turn, turn),
          eq(schema.messages.role, 'assistant')
        ));
      
      // Update job status
      await db
        .update(schema.jobs)
        .set({ 
          status: allSegmentsSent ? ('completed' as JobStatus) : ('failed' as JobStatus),
          updatedAt: new Date(),
          result: JSON.stringify({
            processingTime: Date.now() - startTime,
            segmentsSent: sentSegments.length,
            totalSegments: segments.length,
            messageLength: safeResponse.length,
            inferenceTime: metadata?.inferenceTime,
            tokensUsed: metadata?.tokensUsed,
            model: metadata?.model
          })
        })
        .where(eq(schema.jobs.id, jobId));
      
      // Track metrics
      const totalTime = Date.now() - startTime;
      console.log(`[q_reply] Completed reply for ${chatKey} in ${totalTime}ms (${sentSegments.length}/${segments.length} segments sent)`);
      
      // Store performance metrics in KV for monitoring
      try {
        const metricsKey = `metrics:reply:${new Date().toISOString().split('T')[0]}`;
        const existingMetrics = await env.KV.get(metricsKey, 'json') as any || { count: 0, totalTime: 0, failures: 0 };
        
        await env.KV.put(metricsKey, JSON.stringify({
          count: existingMetrics.count + 1,
          totalTime: existingMetrics.totalTime + totalTime,
          failures: existingMetrics.failures + (allSegmentsSent ? 0 : 1),
          avgTime: (existingMetrics.totalTime + totalTime) / (existingMetrics.count + 1)
        }), {
          expirationTtl: 30 * 24 * 60 * 60 // 30 days
        });
      } catch (metricsError) {
        console.warn(`[q_reply] Failed to store metrics:`, metricsError);
      }
      
      // ACK the message
      message.ack();
      
    } catch (error) {
      console.error(`[q_reply] Error processing reply for ${chatKey}:`, error);
      
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
            eq(schema.jobs.stage, 'reply')
          ));
      } catch (dbError) {
        console.error(`[q_reply] Failed to update job status:`, dbError);
      }
      
      // Retry the message
      message.retry();
    }
  }
}