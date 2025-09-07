import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { kbSpaces } from "./knowledge-base";
import { users } from "./users";

// 智能体表
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  promptSystem: text("prompt_system").notNull(),
  model: text("model").default("gpt-3.5-turbo").notNull(),
  temperature: real("temperature").default(0.7).notNull(),
  maxTokens: integer("max_tokens").default(1000).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 智能体和知识库的关联表
export const agentKbLinks = sqliteTable("agent_kb_links", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  kbId: text("kb_id").notNull(),
  priority: integer("priority").default(0).notNull(), // 优先级，数值越大优先级越高
  weight: real("weight").default(1.0).notNull(), // 权重
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Relations
export const agentsRelations = relations(agents, ({ one, many }) => ({
  user: one(users, {
    fields: [agents.userId],
    references: [users.id],
  }),
  knowledgeBases: many(agentKbLinks),
}));

export const agentKbLinksRelations = relations(agentKbLinks, ({ one }) => ({
  agent: one(agents, {
    fields: [agentKbLinks.agentId],
    references: [agents.id],
  }),
  knowledgeBase: one(kbSpaces, {
    fields: [agentKbLinks.kbId],
    references: [kbSpaces.id],
  }),
}));

// Zod schemas
export const insertAgentSchema = createInsertSchema(agents, {
  name: z.string().min(1, "智能体名称不能为空").max(100, "智能体名称不能超过100个字符"),
  description: z.string().max(500, "描述不能超过500个字符").optional(),
  promptSystem: z.string().min(1, "系统提示词不能为空").max(4000, "系统提示词不能超过4000个字符"),
  model: z.string().min(1, "模型不能为空"),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(4000),
});

export const selectAgentSchema = createSelectSchema(agents);

export const insertAgentKbLinkSchema = createInsertSchema(agentKbLinks, {
  priority: z.number().int().min(0).max(100),
  weight: z.number().min(0).max(10),
});

export const selectAgentKbLinkSchema = createSelectSchema(agentKbLinks);

// Types
export type Agent = z.infer<typeof selectAgentSchema>;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type AgentKbLink = z.infer<typeof selectAgentKbLinkSchema>;
export type InsertAgentKbLink = z.infer<typeof insertAgentKbLinkSchema>;
