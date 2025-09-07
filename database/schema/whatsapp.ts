import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { agents } from "./agents";
import { users } from "./users";

// WhatsApp 会话表
export const waSessions = sqliteTable("wa_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  waAccountId: text("wa_account_id").notNull().unique(), // 对应 WAHA 的 session ID
  agentId: text("agent_id"), // 关联的智能体
  wahaApiUrl: text("waha_api_url").notNull(),
  wahaApiKey: text("waha_api_key").notNull(), // 加密存储
  webhookSecret: text("webhook_secret").notNull(),
  qrCode: text("qr_code"),
  status: text("status", {
    enum: ["connecting", "scan_qr_code", "working", "failed", "stopped"],
  })
    .default("connecting")
    .notNull(),
  autoReplyState: integer("auto_reply_state", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 对话表
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  waAccountId: text("wa_account_id").notNull(),
  chatKey: text("chat_key").notNull().unique(), // format: sessionId:chatId
  lastTurn: integer("last_turn").default(0).notNull(),
  autoReplyState: integer("auto_reply_state", { mode: "boolean" }).default(true).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// 消息表
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  chatKey: text("chat_key").notNull(),
  turn: integer("turn").notNull(),
  role: text("role", { enum: ["user", "assistant", "human"] }).notNull(),
  text: text("text").notNull(),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed", "suppressed"],
  })
    .default("pending")
    .notNull(),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
});

// 任务表
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  chatKey: text("chat_key").notNull(),
  turn: integer("turn").notNull(),
  stage: text("stage", {
    enum: ["retrieve", "infer", "reply"],
  }).notNull(),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed", "suppressed"],
  })
    .default("pending")
    .notNull(),
  payload: text("payload"), // JSON string
  result: text("result"), // JSON string
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// Relations
export const waSessionsRelations = relations(waSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [waSessions.userId],
    references: [users.id],
  }),
  agent: one(agents, {
    fields: [waSessions.agentId],
    references: [agents.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  session: one(waSessions, {
    fields: [conversations.waAccountId],
    references: [waSessions.waAccountId],
  }),
  messages: many(messages),
  jobs: many(jobs),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.chatKey],
    references: [conversations.chatKey],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  conversation: one(conversations, {
    fields: [jobs.chatKey],
    references: [conversations.chatKey],
  }),
}));

// Zod schemas
export const insertWaSessionSchema = createInsertSchema(waSessions, {
  waAccountId: z.string().min(1, "WhatsApp 账号ID不能为空"),
  wahaApiUrl: z.string().url("请输入有效的 WAHA API URL"),
  wahaApiKey: z.string().min(1, "WAHA API Key不能为空"),
});

export const selectWaSessionSchema = createSelectSchema(waSessions);

export const insertConversationSchema = createInsertSchema(conversations, {
  chatKey: z.string().min(1, "聊天键不能为空"),
  lastTurn: z.number().int().min(0),
});

export const selectConversationSchema = createSelectSchema(conversations);

export const insertMessageSchema = createInsertSchema(messages, {
  text: z.string().min(1, "消息内容不能为空"),
  turn: z.number().int().min(0),
});

export const selectMessageSchema = createSelectSchema(messages);

export const insertJobSchema = createInsertSchema(jobs, {
  turn: z.number().int().min(0),
});

export const selectJobSchema = createSelectSchema(jobs);

// Types
export type WaSession = z.infer<typeof selectWaSessionSchema>;
export type InsertWaSession = z.infer<typeof insertWaSessionSchema>;
export type Conversation = z.infer<typeof selectConversationSchema>;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = z.infer<typeof selectMessageSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Job = z.infer<typeof selectJobSchema>;
export type InsertJob = z.infer<typeof insertJobSchema>;
