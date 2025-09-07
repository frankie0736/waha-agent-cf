import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

// 知识库表
export const kbSpaces = sqliteTable("kb_spaces", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 文档表
export const kbDocuments = sqliteTable("kb_documents", {
  id: text("id").primaryKey(),
  kbId: text("kb_id").notNull(),
  filename: text("filename").notNull(),
  filetype: text("filetype").notNull(),
  filesize: integer("filesize").notNull(),
  r2Key: text("r2_key").notNull(),
  status: text("status", { enum: ["processing", "completed", "failed"] })
    .default("processing")
    .notNull(),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// 文档切片表
export const kbChunks = sqliteTable("kb_chunks", {
  id: text("id").primaryKey(),
  kbId: text("kb_id").notNull(),
  docId: text("doc_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  vectorId: text("vector_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Relations
export const kbSpacesRelations = relations(kbSpaces, ({ one, many }) => ({
  user: one(users, {
    fields: [kbSpaces.userId],
    references: [users.id],
  }),
  documents: many(kbDocuments),
  chunks: many(kbChunks),
}));

export const kbDocumentsRelations = relations(kbDocuments, ({ one, many }) => ({
  knowledgeBase: one(kbSpaces, {
    fields: [kbDocuments.kbId],
    references: [kbSpaces.id],
  }),
  chunks: many(kbChunks),
}));

export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  knowledgeBase: one(kbSpaces, {
    fields: [kbChunks.kbId],
    references: [kbSpaces.id],
  }),
  document: one(kbDocuments, {
    fields: [kbChunks.docId],
    references: [kbDocuments.id],
  }),
}));

// Zod schemas
export const insertKbSpaceSchema = createInsertSchema(kbSpaces, {
  name: z.string().min(1, "知识库名称不能为空").max(100, "知识库名称不能超过100个字符"),
  description: z.string().max(500, "描述不能超过500个字符").optional(),
});

export const selectKbSpaceSchema = createSelectSchema(kbSpaces);

export const insertKbDocumentSchema = createInsertSchema(kbDocuments, {
  filename: z.string().min(1, "文件名不能为空"),
  filetype: z.string().min(1, "文件类型不能为空"),
  filesize: z
    .number()
    .int()
    .min(0)
    .max(50 * 1024 * 1024, "文件大小不能超过50MB"),
});

export const selectKbDocumentSchema = createSelectSchema(kbDocuments);

export const insertKbChunkSchema = createInsertSchema(kbChunks, {
  text: z.string().min(1, "文档内容不能为空"),
  chunkIndex: z.number().int().min(0),
});

export const selectKbChunkSchema = createSelectSchema(kbChunks);

// Types
export type KbSpace = z.infer<typeof selectKbSpaceSchema>;
export type InsertKbSpace = z.infer<typeof insertKbSpaceSchema>;
export type KbDocument = z.infer<typeof selectKbDocumentSchema>;
export type InsertKbDocument = z.infer<typeof insertKbDocumentSchema>;
export type KbChunk = z.infer<typeof selectKbChunkSchema>;
export type InsertKbChunk = z.infer<typeof insertKbChunkSchema>;
