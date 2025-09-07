import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  // Better Auth 必需字段
  name: text("name").notNull().default(""),
  email: text("email").unique().notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  
  // 我们的自定义业务字段
  aihubmixKey: text("aihubmix_key"),
  kbLimit: integer("kb_limit").default(5).notNull(),
  agentLimit: integer("agent_limit").default(3).notNull(),
  waLimit: integer("wa_limit").default(2).notNull(),
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }),
});

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("请输入有效的邮箱地址"),
  aihubmixKey: z.string().optional(),
  kbLimit: z.number().int().min(0).max(100),
  agentLimit: z.number().int().min(0).max(50),
  waLimit: z.number().int().min(0).max(20),
});

export const selectUserSchema = createSelectSchema(users);

export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
