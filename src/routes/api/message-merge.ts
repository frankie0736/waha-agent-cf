/**
 * Message Merge API Routes
 * 
 * API endpoints for interacting with the ChatSessionDO
 * and managing message merging configuration.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";

const messageMerge = new Hono<{ Bindings: Env }>();

// Send message to ChatSessionDO
const sendMessageSchema = z.object({
  sessionId: z.string(),
  conversationId: z.string(),
  chatKey: z.string().describe("Format: userId:waAccountId:whatsappChatId"),
  from: z.string(),
  content: z.string(),
  messageId: z.string(),
  timestamp: z.number().optional(),
  mediaUrl: z.string().optional(),
  quotedMessageId: z.string().optional()
});

messageMerge.post(
  "/send",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const data = c.req.valid("json");
    
    try {
      // Generate chatKey-based Durable Object ID
      const doId = c.env.CHAT_SESSIONS.idFromName(data.chatKey);
      const stub = c.env.CHAT_SESSIONS.get(doId);
      
      // Send message to DO
      const response = await stub.fetch("https://do/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          timestamp: data.timestamp || Date.now()
        })
      });
      
      const result = await response.json();
      return c.json(result);
    } catch (error) {
      console.error("Failed to send message to DO:", error);
      throw ApiErrors.InternalServerError("Failed to process message");
    }
  }
);

// Configure merge window
const configureSchema = z.object({
  chatKey: z.string(),
  mergeWindowMs: z.number().min(1500).max(3000)
});

messageMerge.post(
  "/configure",
  zValidator("json", configureSchema),
  async (c) => {
    const { chatKey, mergeWindowMs } = c.req.valid("json");
    
    try {
      const doId = c.env.CHAT_SESSIONS.idFromName(chatKey);
      const stub = c.env.CHAT_SESSIONS.get(doId);
      
      const response = await stub.fetch("https://do/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeWindowMs })
      });
      
      const result = await response.json();
      return c.json(result);
    } catch (error) {
      console.error("Failed to configure DO:", error);
      throw ApiErrors.InternalServerError("Failed to configure merge window");
    }
  }
);

// Get status of a chat session
messageMerge.get(
  "/status/:chatKey",
  async (c) => {
    const chatKey = c.req.param("chatKey");
    
    try {
      const doId = c.env.CHAT_SESSIONS.idFromName(chatKey);
      const stub = c.env.CHAT_SESSIONS.get(doId);
      
      const response = await stub.fetch("https://do/status");
      const result = await response.json();
      
      return c.json(result);
    } catch (error) {
      console.error("Failed to get DO status:", error);
      throw ApiErrors.InternalServerError("Failed to get session status");
    }
  }
);

// Force flush messages for a chat
const flushSchema = z.object({
  chatKey: z.string().optional()
});

messageMerge.post(
  "/flush",
  zValidator("json", flushSchema),
  async (c) => {
    const { chatKey } = c.req.valid("json");
    
    if (!chatKey) {
      throw ApiErrors.ValidationError("chatKey is required");
    }
    
    try {
      const doId = c.env.CHAT_SESSIONS.idFromName(chatKey);
      const stub = c.env.CHAT_SESSIONS.get(doId);
      
      const response = await stub.fetch("https://do/flush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatKey })
      });
      
      const result = await response.json();
      return c.json(result);
    } catch (error) {
      console.error("Failed to flush DO buffer:", error);
      throw ApiErrors.InternalServerError("Failed to flush messages");
    }
  }
);

// Test endpoint to simulate message flow
messageMerge.post(
  "/test",
  async (c) => {
    const testChatKey = "test:session1:chat1";
    const doId = c.env.CHAT_SESSIONS.idFromName(testChatKey);
    const stub = c.env.CHAT_SESSIONS.get(doId);
    
    // Send test messages
    const messages = [
      "你好",
      "我想咨询",
      "产品价格"
    ];
    
    const results = [];
    for (const [index, content] of messages.entries()) {
      const response = await stub.fetch("https://do/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: `test-${Date.now()}-${index}`,
          sessionId: "test-session",
          conversationId: "test-conversation",
          chatKey: testChatKey,
          from: "user",
          content,
          timestamp: Date.now()
        })
      });
      
      const result = await response.json();
      results.push(result);
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Wait for merge window
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Get final status
    const statusResponse = await stub.fetch("https://do/status");
    const status = await statusResponse.json();
    
    return c.json({
      message: "Test completed",
      results,
      finalStatus: status
    });
  }
);

export { messageMerge };