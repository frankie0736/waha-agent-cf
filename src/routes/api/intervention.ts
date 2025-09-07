/**
 * Manual Intervention API Routes
 * 
 * Provides endpoints for controlling human intervention at both
 * session and conversation levels.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import { ManualInterventionController } from "../../services/manual-intervention";
import { requireAuth } from "../../middleware/auth";

const intervention = new Hono<{ Bindings: Env, Variables: { user?: any } }>();

// Session-level controls
const sessionControlSchema = z.object({
  sessionId: z.string().min(1)
});

// Pause auto-reply for entire session
intervention.post(
  "/session/pause",
  requireAuth,
  zValidator("json", sessionControlSchema),
  async (c) => {
    const { sessionId } = c.req.valid("json");
    const userId = c.get("user")?.id;
    
    if (!userId) {
      throw ApiErrors.Unauthorized("User not authenticated");
    }
    
    try {
      const controller = new ManualInterventionController(c.env);
      await controller.pauseSession(sessionId);
      
      return c.json({
        success: true,
        message: "Session auto-reply paused",
        sessionId,
        autoReplyState: false,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to pause session:", error);
      throw ApiErrors.InternalServerError("Failed to pause session");
    }
  }
);

// Resume auto-reply for entire session
intervention.post(
  "/session/resume",
  requireAuth,
  zValidator("json", sessionControlSchema),
  async (c) => {
    const { sessionId } = c.req.valid("json");
    const userId = c.get("user")?.id;
    
    if (!userId) {
      throw ApiErrors.Unauthorized("User not authenticated");
    }
    
    try {
      const controller = new ManualInterventionController(c.env);
      await controller.resumeSession(sessionId);
      
      return c.json({
        success: true,
        message: "Session auto-reply resumed",
        sessionId,
        autoReplyState: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to resume session:", error);
      throw ApiErrors.InternalServerError("Failed to resume session");
    }
  }
);

// Get session status
intervention.get(
  "/session/status/:sessionId",
  requireAuth,
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const userId = c.get("user")?.id;
    
    if (!userId) {
      throw ApiErrors.Unauthorized("User not authenticated");
    }
    
    try {
      const controller = new ManualInterventionController(c.env);
      const status = await controller.getSessionStatus(sessionId);
      
      return c.json({
        success: true,
        status
      });
    } catch (error) {
      console.error("Failed to get session status:", error);
      throw ApiErrors.InternalServerError("Failed to get session status");
    }
  }
);

// Get conversation status
intervention.get(
  "/conversation/status/:chatKey",
  requireAuth,
  async (c) => {
    const chatKey = c.req.param("chatKey");
    const userId = c.get("user")?.id;
    
    if (!userId) {
      throw ApiErrors.Unauthorized("User not authenticated");
    }
    
    try {
      const controller = new ManualInterventionController(c.env);
      const status = await controller.getConversationStatus(chatKey);
      
      return c.json({
        success: true,
        status
      });
    } catch (error) {
      console.error("Failed to get conversation status:", error);
      throw ApiErrors.InternalServerError("Failed to get conversation status");
    }
  }
);

// Check if auto-reply should be active
const shouldAutoReplySchema = z.object({
  chatKey: z.string().min(1)
});

intervention.post(
  "/should-auto-reply",
  zValidator("json", shouldAutoReplySchema),
  async (c) => {
    const { chatKey } = c.req.valid("json");
    
    try {
      const controller = new ManualInterventionController(c.env);
      const status = await controller.shouldAutoReply(chatKey);
      
      return c.json({
        success: true,
        ...status
      });
    } catch (error) {
      console.error("Failed to check auto-reply status:", error);
      throw ApiErrors.InternalServerError("Failed to check auto-reply status");
    }
  }
);

// Process message for punctuation control
const processMessageSchema = z.object({
  chatKey: z.string().min(1),
  message: z.string()
});

intervention.post(
  "/process-punctuation",
  zValidator("json", processMessageSchema),
  async (c) => {
    const { chatKey, message } = c.req.valid("json");
    
    try {
      const controller = new ManualInterventionController(c.env);
      const result = await controller.handlePunctuationControl(chatKey, message);
      
      return c.json({
        success: true,
        ...result,
        chatKey,
        originalMessage: message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to process punctuation control:", error);
      throw ApiErrors.InternalServerError("Failed to process punctuation control");
    }
  }
);

// Get intervention logs
intervention.get(
  "/logs",
  requireAuth,
  async (c) => {
    const userId = c.get("user")?.id;
    
    if (!userId) {
      throw ApiErrors.Unauthorized("User not authenticated");
    }
    
    const action = c.req.query("action");
    const target = c.req.query("target");
    const limit = parseInt(c.req.query("limit") || "100");
    
    try {
      const controller = new ManualInterventionController(c.env);
      const logs = await controller.getInterventionLogs({
        action,
        target,
        limit
      });
      
      return c.json({
        success: true,
        logs,
        count: logs.length
      });
    } catch (error) {
      console.error("Failed to get intervention logs:", error);
      throw ApiErrors.InternalServerError("Failed to get intervention logs");
    }
  }
);

// Get intervention statistics
intervention.get(
  "/stats",
  requireAuth,
  async (c) => {
    const userId = c.get("user")?.id;
    
    if (!userId) {
      throw ApiErrors.Unauthorized("User not authenticated");
    }
    
    try {
      const controller = new ManualInterventionController(c.env);
      const stats = await controller.getInterventionStats();
      
      return c.json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to get intervention stats:", error);
      throw ApiErrors.InternalServerError("Failed to get intervention stats");
    }
  }
);

// Test endpoint for punctuation control
intervention.post(
  "/test",
  async (c) => {
    const controller = new ManualInterventionController(c.env);
    const testChatKey = "test:session1:chat1";
    
    // Test cases
    const testCases = [
      { message: "Hello, how are you,", expected: "paused" },
      { message: "I need help.", expected: "resumed" },
      { message: "What's the price?", expected: "no_change" },
      { message: "Stop the bot,", expected: "paused" },
      { message: "Resume please.", expected: "resumed" }
    ];
    
    const results = [];
    for (const test of testCases) {
      const result = await controller.handlePunctuationControl(
        testChatKey,
        test.message
      );
      
      results.push({
        message: test.message,
        expected: test.expected,
        actual: result.action,
        passed: result.action === test.expected
      });
    }
    
    // Check final status
    const finalStatus = await controller.shouldAutoReply(testChatKey);
    
    return c.json({
      success: true,
      testResults: results,
      allPassed: results.every(r => r.passed),
      finalStatus
    });
  }
);

export { intervention };