import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { agents } from "./agents";
import { users } from "./users";

// 测试会话表
export const testSessions = sqliteTable("test_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["active", "paused", "completed", "archived"],
  })
    .default("active")
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 测试对话表
export const testConversations = sqliteTable("test_conversations", {
  id: text("id").primaryKey(),
  testSessionId: text("test_session_id").notNull(),
  agentId: text("agent_id").notNull(),
  title: text("title"),
  lastTurn: integer("last_turn").default(0).notNull(),
  totalMessages: integer("total_messages").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  averageResponseTime: real("average_response_time").default(0).notNull(), // in milliseconds
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 测试消息表
export const testMessages = sqliteTable("test_messages", {
  id: text("id").primaryKey(),
  testConversationId: text("test_conversation_id").notNull(),
  turn: integer("turn").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  tokens: integer("tokens"),
  responseTime: integer("response_time"), // in milliseconds
  searchResults: text("search_results"), // JSON string of vector search results
  debugInfo: text("debug_info"), // JSON string with debugging information
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

// 测试用例表
export const testCases = sqliteTable("test_cases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  inputMessages: text("input_messages").notNull(), // JSON array of messages
  expectedOutputs: text("expected_outputs"), // JSON array of expected responses
  tags: text("tags"), // JSON array of tags
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 测试运行结果表
export const testRuns = sqliteTable("test_runs", {
  id: text("id").primaryKey(),
  testCaseId: text("test_case_id").notNull(),
  testSessionId: text("test_session_id").notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  })
    .default("pending")
    .notNull(),
  actualOutputs: text("actual_outputs"), // JSON array of actual responses
  metrics: text("metrics"), // JSON object with performance metrics
  errorMessage: text("error_message"),
  startTime: integer("start_time", { mode: "timestamp" }),
  endTime: integer("end_time", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Relations
export const testSessionsRelations = relations(testSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [testSessions.userId],
    references: [users.id],
  }),
  agent: one(agents, {
    fields: [testSessions.agentId],
    references: [agents.id],
  }),
  conversations: many(testConversations),
  testRuns: many(testRuns),
}));

export const testConversationsRelations = relations(testConversations, ({ one, many }) => ({
  testSession: one(testSessions, {
    fields: [testConversations.testSessionId],
    references: [testSessions.id],
  }),
  agent: one(agents, {
    fields: [testConversations.agentId],
    references: [agents.id],
  }),
  messages: many(testMessages),
}));

export const testMessagesRelations = relations(testMessages, ({ one }) => ({
  testConversation: one(testConversations, {
    fields: [testMessages.testConversationId],
    references: [testConversations.id],
  }),
}));

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  user: one(users, {
    fields: [testCases.userId],
    references: [users.id],
  }),
  agent: one(agents, {
    fields: [testCases.agentId],
    references: [agents.id],
  }),
  testRuns: many(testRuns),
}));

export const testRunsRelations = relations(testRuns, ({ one }) => ({
  testCase: one(testCases, {
    fields: [testRuns.testCaseId],
    references: [testCases.id],
  }),
  testSession: one(testSessions, {
    fields: [testRuns.testSessionId],
    references: [testSessions.id],
  }),
}));

// Zod schemas
export const insertTestSessionSchema = createInsertSchema(testSessions, {
  name: z.string().min(1, "测试会话名称不能为空").max(100, "测试会话名称不能超过100个字符"),
  description: z.string().max(500, "描述不能超过500个字符").optional(),
});

export const selectTestSessionSchema = createSelectSchema(testSessions);

export const insertTestConversationSchema = createInsertSchema(testConversations, {
  title: z.string().max(200, "对话标题不能超过200个字符").optional(),
});

export const selectTestConversationSchema = createSelectSchema(testConversations);

export const insertTestMessageSchema = createInsertSchema(testMessages, {
  content: z.string().min(1, "消息内容不能为空"),
  turn: z.number().int().min(0),
});

export const selectTestMessageSchema = createSelectSchema(testMessages);

export const insertTestCaseSchema = createInsertSchema(testCases, {
  name: z.string().min(1, "测试用例名称不能为空").max(100, "测试用例名称不能超过100个字符"),
  description: z.string().max(500, "描述不能超过500个字符").optional(),
  inputMessages: z.string().min(1, "输入消息不能为空"),
});

export const selectTestCaseSchema = createSelectSchema(testCases);

export const insertTestRunSchema = createInsertSchema(testRuns);

export const selectTestRunSchema = createSelectSchema(testRuns);

// Types
export type TestSession = z.infer<typeof selectTestSessionSchema>;
export type InsertTestSession = z.infer<typeof insertTestSessionSchema>;
export type TestConversation = z.infer<typeof selectTestConversationSchema>;
export type InsertTestConversation = z.infer<typeof insertTestConversationSchema>;
export type TestMessage = z.infer<typeof selectTestMessageSchema>;
export type InsertTestMessage = z.infer<typeof insertTestMessageSchema>;
export type TestCase = z.infer<typeof selectTestCaseSchema>;
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestRun = z.infer<typeof selectTestRunSchema>;
export type InsertTestRun = z.infer<typeof insertTestRunSchema>;

// Helper types for API
export interface TestMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface TestPerformanceMetrics {
  totalMessages: number;
  totalTokens: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  successfulResponses: number;
  failedResponses: number;
}

export interface TestDebugInfo {
  agentConfig: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
  searchResults?: {
    query: string;
    results: Array<{
      content: string;
      score: number;
      source: string;
    }>;
  };
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  responseTime: number;
  timestamp: string;
}