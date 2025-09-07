/**
 * Manual Intervention Controller
 * 
 * Implements dual-layer human intervention control:
 * - Session level: Admin controls for entire WhatsApp accounts
 * - Conversation level: Punctuation-based control for individual chats
 * 
 * Priority: Session > Conversation
 */

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../index";
import * as schema from "../../database/schema";

export interface InterventionStatus {
  shouldAutoReply: boolean;
  reason?: 'session_paused' | 'conversation_paused' | 'active';
  sessionState?: boolean;
  conversationState?: boolean;
}

export interface PunctuationControlResult {
  action: 'paused' | 'resumed' | 'no_change';
  message?: string;
}

export class ManualInterventionController {
  private db: ReturnType<typeof drizzle<typeof schema>>;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.db = drizzle(env.DB, { schema }) as ReturnType<typeof drizzle<typeof schema>>;
  }

  /**
   * Session-level control - Pause auto-reply for entire session
   */
  async pauseSession(sessionId: string): Promise<void> {
    await this.db
      .update(schema.waSessions)
      .set({ 
        autoReplyState: false,
        updatedAt: new Date()
      })
      .where(eq(schema.waSessions.id, sessionId));
    
    // Log the intervention
    await this.logIntervention('session_pause', sessionId);
  }

  /**
   * Session-level control - Resume auto-reply for entire session
   */
  async resumeSession(sessionId: string): Promise<void> {
    await this.db
      .update(schema.waSessions)
      .set({ 
        autoReplyState: true,
        updatedAt: new Date()
      })
      .where(eq(schema.waSessions.id, sessionId));
    
    // Log the intervention
    await this.logIntervention('session_resume', sessionId);
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<any> {
    const session = await this.db.query.waSessions.findFirst({
      where: eq(schema.waSessions.id, sessionId)
    });
    
    return {
      id: session?.id,
      waAccountId: session?.waAccountId,
      status: session?.status,
      autoReplyState: session?.autoReplyState,
      createdAt: session?.createdAt,
      updatedAt: session?.updatedAt
    };
  }

  /**
   * Conversation-level control - Handle punctuation commands
   * Comma (,) at end = pause
   * Period (.) at end = resume
   */
  async handlePunctuationControl(
    chatKey: string, 
    message: string
  ): Promise<PunctuationControlResult> {
    const trimmed = message.trim();
    
    // Check for comma at the end (pause command)
    if (trimmed.endsWith(',')) {
      // Start human intervention for this conversation
      await this.pauseConversation(chatKey);
      return {
        action: 'paused',
        message: 'Human intervention started for this conversation'
      };
    }
    
    // Check for period at the end (resume command)
    if (trimmed.endsWith('.')) {
      // End human intervention for this conversation
      await this.resumeConversation(chatKey);
      return {
        action: 'resumed',
        message: 'Auto-reply resumed for this conversation'
      };
    }
    
    return { action: 'no_change' };
  }

  /**
   * Pause auto-reply for a specific conversation
   */
  private async pauseConversation(chatKey: string): Promise<void> {
    // Check if conversation exists
    let conversation = await this.db.query.conversations.findFirst({
      where: eq(schema.conversations.chatKey, chatKey)
    });

    if (conversation) {
      // Update existing conversation
      await this.db
        .update(schema.conversations)
        .set({ 
          autoReplyState: false,
          updatedAt: new Date()
        })
        .where(eq(schema.conversations.chatKey, chatKey));
    } else {
      // Create new conversation record with paused state
      const [waAccountId] = chatKey.split(':');
      await this.db
        .insert(schema.conversations)
        .values({
          waAccountId,
          chatKey,
          lastTurn: 0,
          autoReplyState: false,
          updatedAt: new Date()
        });
    }
    
    // Log the intervention
    await this.logIntervention('conversation_pause', chatKey);
  }

  /**
   * Resume auto-reply for a specific conversation
   */
  private async resumeConversation(chatKey: string): Promise<void> {
    // Update conversation state
    await this.db
      .update(schema.conversations)
      .set({ 
        autoReplyState: true,
        updatedAt: new Date()
      })
      .where(eq(schema.conversations.chatKey, chatKey));
    
    // Log the intervention
    await this.logIntervention('conversation_resume', chatKey);
  }

  /**
   * Get conversation status
   */
  async getConversationStatus(chatKey: string): Promise<any> {
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(schema.conversations.chatKey, chatKey)
    });
    
    return {
      chatKey: conversation?.chatKey,
      autoReplyState: conversation?.autoReplyState,
      lastTurn: conversation?.lastTurn,
      updatedAt: conversation?.updatedAt
    };
  }

  /**
   * Check if auto-reply should be active
   * Priority: Session > Conversation
   */
  async shouldAutoReply(chatKey: string): Promise<InterventionStatus> {
    // Extract waAccountId from chatKey (format: userId:waAccountId:whatsappChatId)
    const parts = chatKey.split(':');
    if (parts.length < 2) {
      return { 
        shouldAutoReply: true, 
        reason: 'active' 
      };
    }
    
    const waAccountId = parts[1] || '';
    
    // Check session-level control first (higher priority)
    const session = await this.db.query.waSessions.findFirst({
      where: eq(schema.waSessions.waAccountId, waAccountId)
    });
    
    if (session?.autoReplyState === false) {
      return { 
        shouldAutoReply: false, 
        reason: 'session_paused',
        sessionState: false
      };
    }
    
    // Then check conversation-level control
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(schema.conversations.chatKey, chatKey)
    });
    
    if (conversation?.autoReplyState === false) {
      return { 
        shouldAutoReply: false, 
        reason: 'conversation_paused',
        sessionState: session?.autoReplyState ?? true,
        conversationState: false
      };
    }
    
    // Both levels allow auto-reply
    return { 
      shouldAutoReply: true, 
      reason: 'active',
      sessionState: session?.autoReplyState ?? true,
      conversationState: conversation?.autoReplyState ?? true
    };
  }

  /**
   * Log intervention events for audit
   */
  private async logIntervention(
    action: string, 
    target: string
  ): Promise<void> {
    const key = `intervention:${Date.now()}:${action}:${target}`;
    const data = {
      action,
      target,
      timestamp: new Date().toISOString(),
      epochMs: Date.now()
    };
    
    try {
      // Store in KV with 30-day TTL for audit trail
      await this.env.KV.put(
        key, 
        JSON.stringify(data),
        { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
      );
    } catch (error) {
      console.error('Failed to log intervention:', error);
    }
  }

  /**
   * Get intervention logs
   */
  async getInterventionLogs(
    filter?: { action?: string; target?: string; limit?: number }
  ): Promise<any[]> {
    const prefix = 'intervention:';
    const list = await this.env.KV.list({ prefix });
    
    const logs = [];
    for (const key of list.keys) {
      const value = await this.env.KV.get(key.name);
      if (value) {
        const log = JSON.parse(value);
        
        // Apply filters
        if (filter?.action && log.action !== filter.action) continue;
        if (filter?.target && log.target !== filter.target) continue;
        
        logs.push(log);
      }
      
      if (filter?.limit && logs.length >= filter.limit) break;
    }
    
    // Sort by timestamp (newest first)
    return logs.sort((a, b) => b.epochMs - a.epochMs);
  }

  /**
   * Get aggregated intervention statistics
   */
  async getInterventionStats(): Promise<any> {
    const logs = await this.getInterventionLogs();
    
    const stats = {
      total: logs.length,
      byAction: {} as Record<string, number>,
      last24Hours: 0,
      last7Days: 0
    };
    
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    for (const log of logs) {
      // Count by action
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
      
      // Count recent activity
      if (log.epochMs > oneDayAgo) stats.last24Hours++;
      if (log.epochMs > oneWeekAgo) stats.last7Days++;
    }
    
    return stats;
  }
}

/**
 * AI Safety Trim Function
 * Removes trailing commas or periods to prevent AI from accidentally
 * triggering intervention controls
 */
export function safeTrim(text: string): string {
  const trimmed = text.trim();
  
  // Remove single trailing comma or period
  if (trimmed.endsWith(',') || trimmed.endsWith('.')) {
    return trimmed.slice(0, -1).trim();
  }
  
  return trimmed;
}

/**
 * Check if a message contains intervention commands
 * Used to validate and process user messages
 */
export function hasInterventionCommand(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.endsWith(',') || trimmed.endsWith('.');
}

/**
 * Extract clean message without intervention commands
 * Used when we want to process the message content without the command
 */
export function extractCleanMessage(message: string): string {
  const trimmed = message.trim();
  
  if (trimmed.endsWith(',') || trimmed.endsWith('.')) {
    return trimmed.slice(0, -1).trim();
  }
  
  return trimmed;
}