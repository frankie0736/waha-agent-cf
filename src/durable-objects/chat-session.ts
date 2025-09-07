/**
 * ChatSessionDO - Durable Object for Message Merging
 * 
 * This Durable Object handles message merging with a 2-second window.
 * It ensures messages are processed in order and merged intelligently
 * before being sent to the AI processing pipeline.
 */

import type { Env } from "../index";

// Message types and interfaces
export interface IncomingMessage {
  messageId: string;
  sessionId: string;
  conversationId: string;
  chatKey: string;
  from: string;
  content: string;
  timestamp: number;
  mediaUrl?: string;
  quotedMessageId?: string;
}

export interface MergedMessage {
  chatKey: string;
  sessionId: string;
  conversationId: string;
  messages: IncomingMessage[];
  mergedContent: string;
  startTime: number;
  endTime: number;
  messageCount: number;
  hasMedia: boolean;
}

interface MessageBuffer {
  messages: IncomingMessage[];
  startTime: number;
  lastMessageTime: number;
  alarmScheduled: boolean;
}

// Configuration
const MERGE_WINDOW_MS = 2000; // 2 seconds
const MAX_MERGE_WINDOW_MS = 3000; // Maximum 3 seconds
const MIN_MERGE_WINDOW_MS = 1500; // Minimum 1.5 seconds
const IMMEDIATE_PROCESS_CHARS = ["。", "！", "？", ".", "!", "?"]; // End punctuation

export class ChatSessionDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private buffers: Map<string, MessageBuffer> = new Map();
  private mergeWindowMs: number = MERGE_WINDOW_MS;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // Restore state from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedBuffers = await this.state.storage.get<Map<string, MessageBuffer>>("buffers");
      if (storedBuffers) {
        this.buffers = new Map(storedBuffers);
      }
      
      const storedWindow = await this.state.storage.get<number>("mergeWindowMs");
      if (storedWindow) {
        this.mergeWindowMs = storedWindow;
      }
    });
  }

  // Main request handler
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case "/message":
          return this.handleMessage(request);
        case "/configure":
          return this.handleConfigure(request);
        case "/status":
          return this.handleStatus();
        case "/flush":
          return this.handleFlush(request);
        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      console.error("ChatSessionDO error:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // Handle incoming message
  private async handleMessage(request: Request): Promise<Response> {
    const message: IncomingMessage = await request.json();
    const { chatKey } = message;

    // Get or create buffer for this chat
    let buffer = this.buffers.get(chatKey);
    if (!buffer) {
      buffer = {
        messages: [],
        startTime: Date.now(),
        lastMessageTime: Date.now(),
        alarmScheduled: false
      };
      this.buffers.set(chatKey, buffer);
    }

    // Add message to buffer
    buffer.messages.push(message);
    buffer.lastMessageTime = Date.now();

    // Check if should process immediately
    const shouldProcessNow = this.shouldProcessImmediately(message.content);
    
    if (shouldProcessNow) {
      // Process immediately for end punctuation
      await this.processBuffer(chatKey);
    } else if (!buffer.alarmScheduled) {
      // Schedule alarm for merge window
      const alarmTime = Date.now() + this.mergeWindowMs;
      await this.state.storage.setAlarm(alarmTime);
      buffer.alarmScheduled = true;
    }

    // Save state
    await this.state.storage.put("buffers", Array.from(this.buffers.entries()));

    return new Response(JSON.stringify({
      status: "buffered",
      chatKey,
      bufferSize: buffer.messages.length,
      willProcessAt: shouldProcessNow ? "immediate" : `${this.mergeWindowMs}ms`
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Handle alarm (triggered after merge window)
  async alarm(): Promise<void> {
    const now = Date.now();
    
    // Process all buffers that have expired
    for (const [chatKey, buffer] of this.buffers) {
      if (buffer.alarmScheduled && 
          (now - buffer.lastMessageTime) >= this.mergeWindowMs) {
        await this.processBuffer(chatKey);
      }
    }
    
    // Save updated state
    await this.state.storage.put("buffers", Array.from(this.buffers.entries()));
  }

  // Process buffer and send to queue
  private async processBuffer(chatKey: string): Promise<void> {
    const buffer = this.buffers.get(chatKey);
    if (!buffer || buffer.messages.length === 0) {
      return;
    }

    // Sort messages by timestamp to ensure order
    buffer.messages.sort((a, b) => a.timestamp - b.timestamp);

    // Create merged message
    const mergedMessage: MergedMessage = {
      chatKey,
      sessionId: buffer.messages[0].sessionId,
      conversationId: buffer.messages[0].conversationId,
      messages: buffer.messages,
      mergedContent: this.mergeMessageContent(buffer.messages),
      startTime: buffer.startTime,
      endTime: Date.now(),
      messageCount: buffer.messages.length,
      hasMedia: buffer.messages.some(m => !!m.mediaUrl)
    };

    // Send to retrieval queue
    try {
      await this.env.QUEUE_RETRIEVE.send(mergedMessage);
      console.log(`Processed ${mergedMessage.messageCount} messages for chatKey: ${chatKey}`);
    } catch (error) {
      console.error(`Failed to send to queue for chatKey ${chatKey}:`, error);
      // TODO: Implement retry logic or dead letter queue
    }

    // Clear buffer
    this.buffers.delete(chatKey);
  }

  // Merge message content intelligently
  private mergeMessageContent(messages: IncomingMessage[]): string {
    if (messages.length === 1) {
      return messages[0].content;
    }

    // Join messages with appropriate spacing
    const contents = messages.map(m => m.content.trim());
    
    // Smart merge: add space between messages unless they end/start with punctuation
    let merged = contents[0] || "";
    for (let i = 1; i < contents.length; i++) {
      const prevEndsWithPunctuation = /[。！？，、.!?,;]$/.test(merged);
      const currStartsWithPunctuation = /^[。！？，、.!?,;]/.test(contents[i] || "");
      
      if (prevEndsWithPunctuation || currStartsWithPunctuation) {
        merged += contents[i] || "";
      } else {
        merged += " " + (contents[i] || "");
      }
    }

    return merged;
  }

  // Check if message should be processed immediately
  private shouldProcessImmediately(content: string): boolean {
    const trimmed = content.trim();
    
    // Check for end punctuation
    for (const punct of IMMEDIATE_PROCESS_CHARS) {
      if (trimmed.endsWith(punct)) {
        return true;
      }
    }
    
    // Check for very long messages (>500 chars)
    if (trimmed.length > 500) {
      return true;
    }
    
    return false;
  }

  // Configure merge window
  private async handleConfigure(request: Request): Promise<Response> {
    const data = await request.json() as { mergeWindowMs?: number };
    const { mergeWindowMs } = data;
    
    if (typeof mergeWindowMs === "number" && 
        mergeWindowMs >= MIN_MERGE_WINDOW_MS && 
        mergeWindowMs <= MAX_MERGE_WINDOW_MS) {
      this.mergeWindowMs = mergeWindowMs;
      await this.state.storage.put("mergeWindowMs", mergeWindowMs);
      
      return new Response(JSON.stringify({
        status: "configured",
        mergeWindowMs: this.mergeWindowMs
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({
      error: `Merge window must be between ${MIN_MERGE_WINDOW_MS}ms and ${MAX_MERGE_WINDOW_MS}ms`
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Get status
  private async handleStatus(): Promise<Response> {
    const bufferStats = Array.from(this.buffers.entries()).map(([chatKey, buffer]) => ({
      chatKey,
      messageCount: buffer.messages.length,
      startTime: buffer.startTime,
      lastMessageTime: buffer.lastMessageTime,
      alarmScheduled: buffer.alarmScheduled
    }));

    return new Response(JSON.stringify({
      mergeWindowMs: this.mergeWindowMs,
      activeBuffers: this.buffers.size,
      buffers: bufferStats
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Force flush a specific buffer
  private async handleFlush(request: Request): Promise<Response> {
    const data = await request.json() as { chatKey?: string };
    const { chatKey } = data;
    
    if (chatKey) {
      // Flush specific chat
      await this.processBuffer(chatKey);
      return new Response(JSON.stringify({
        status: "flushed",
        chatKey
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // Flush all buffers
      const chatKeys = Array.from(this.buffers.keys());
      for (const key of chatKeys) {
        await this.processBuffer(key);
      }
      return new Response(JSON.stringify({
        status: "flushed_all",
        count: chatKeys.length
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
}

// Export the Durable Object
export default ChatSessionDO;