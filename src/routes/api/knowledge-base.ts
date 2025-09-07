import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import * as schema from "../../../database/schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

const knowledgeBase = new Hono<{ Bindings: Env }>();

// 创建知识库
const createRoute = knowledgeBase.post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1, "知识库名称不能为空").max(100, "知识库名称不能超过100个字符"),
      description: z.string().max(500, "描述不能超过500个字符").optional()
    })
  ),
  async (c) => {
    const { name, description } = c.req.valid("json");
    
    // TODO: 从会话中获取用户ID
    // const session = await getSession(c);
    // if (!session) throw ApiErrors.Unauthorized();
    const userId = "test-user-id"; // 临时使用测试用户ID
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      const kbId = crypto.randomUUID();
      const now = new Date();
      
      await db.insert(schema.kbSpaces).values({
        id: kbId,
        userId,
        name,
        description: description || null,
        createdAt: now,
        updatedAt: now
      });

      return c.json({
        id: kbId,
        name,
        description,
        createdAt: now.toISOString()
      }, 201);
      
    } catch (error) {
      console.error("Create knowledge base error:", error);
      throw ApiErrors.InternalServerError("创建知识库失败");
    }
  }
);

// 获取知识库列表
const listRoute = knowledgeBase.get(
  "/",
  zValidator(
    "query",
    z.object({
      limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default(20),
      offset: z.string().transform(Number).pipe(z.number().min(0)).default(0)
    })
  ),
  async (c) => {
    const { limit, offset } = c.req.valid("query");
    
    // TODO: 从会话中获取用户ID  
    const userId = "test-user-id";
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      const kbSpaces = await db.query.kbSpaces.findMany({
        where: eq(schema.kbSpaces.userId, userId),
        limit,
        offset,
        orderBy: (kbs, { desc }) => [desc(kbs.createdAt)]
      });

      return c.json({
        knowledgeBases: kbSpaces.map(kb => ({
          id: kb.id,
          name: kb.name,
          description: kb.description,
          createdAt: new Date(kb.createdAt).toISOString(),
          updatedAt: kb.updatedAt ? new Date(kb.updatedAt).toISOString() : null
        })),
        pagination: {
          limit,
          offset,
          total: kbSpaces.length
        }
      });
      
    } catch (error) {
      console.error("List knowledge bases error:", error);
      throw ApiErrors.InternalServerError("获取知识库列表失败");
    }
  }
);

// 获取知识库详情
const getRoute = knowledgeBase.get(
  "/:kb_id",
  zValidator(
    "param",
    z.object({
      kb_id: z.string().uuid()
    })
  ),
  async (c) => {
    const { kb_id } = c.req.valid("param");
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      const kbSpace = await db.query.kbSpaces.findFirst({
        where: eq(schema.kbSpaces.id, kb_id)
      });
      
      if (!kbSpace) {
        throw ApiErrors.NotFound("知识库不存在");
      }

      // 获取文档统计
      const documentCount = await db.query.kbDocuments.findMany({
        where: eq(schema.kbDocuments.kbId, kb_id)
      });

      return c.json({
        id: kbSpace.id,
        name: kbSpace.name,
        description: kbSpace.description,
        createdAt: new Date(kbSpace.createdAt).toISOString(),
        updatedAt: kbSpace.updatedAt ? new Date(kbSpace.updatedAt).toISOString() : null,
        stats: {
          documentCount: documentCount.length,
          totalSize: documentCount.reduce((sum, doc) => sum + doc.filesize, 0)
        }
      });
      
    } catch (error) {
      console.error("Get knowledge base error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("获取知识库详情失败");
    }
  }
);

// 更新知识库
const updateRoute = knowledgeBase.put(
  "/:kb_id",
  zValidator(
    "param",
    z.object({
      kb_id: z.string().uuid()
    })
  ),
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional()
    })
  ),
  async (c) => {
    const { kb_id } = c.req.valid("param");
    const updateData = c.req.valid("json");
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      const kbSpace = await db.query.kbSpaces.findFirst({
        where: eq(schema.kbSpaces.id, kb_id)
      });
      
      if (!kbSpace) {
        throw ApiErrors.NotFound("知识库不存在");
      }

      const now = new Date();
      const updateFields: Record<string, any> = { updatedAt: now };
      if (updateData.name !== undefined) updateFields.name = updateData.name;
      if (updateData.description !== undefined) updateFields.description = updateData.description;
      
      await db.update(schema.kbSpaces)
        .set(updateFields)
        .where(eq(schema.kbSpaces.id, kb_id));

      return c.json({
        id: kb_id,
        name: updateData.name || kbSpace.name,
        description: updateData.description || kbSpace.description,
        updatedAt: now.toISOString()
      });
      
    } catch (error) {
      console.error("Update knowledge base error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("更新知识库失败");
    }
  }
);

// 删除知识库
const deleteRoute = knowledgeBase.delete(
  "/:kb_id",
  zValidator(
    "param",
    z.object({
      kb_id: z.string().uuid()
    })
  ),
  async (c) => {
    const { kb_id } = c.req.valid("param");
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      const kbSpace = await db.query.kbSpaces.findFirst({
        where: eq(schema.kbSpaces.id, kb_id)
      });
      
      if (!kbSpace) {
        throw ApiErrors.NotFound("知识库不存在");
      }

      // 获取所有相关文档
      const documents = await db.query.kbDocuments.findMany({
        where: eq(schema.kbDocuments.kbId, kb_id)
      });

      // 删除 R2 中的所有文件
      await Promise.all(
        documents.map(doc => c.env.R2.delete(doc.r2Key))
      );

      // 删除相关的 chunks
      await db.delete(schema.kbChunks).where(eq(schema.kbChunks.kbId, kb_id));
      
      // 删除相关文档记录
      await db.delete(schema.kbDocuments).where(eq(schema.kbDocuments.kbId, kb_id));
      
      // 删除知识库记录
      await db.delete(schema.kbSpaces).where(eq(schema.kbSpaces.id, kb_id));

      return c.json({
        message: "知识库删除成功",
        deletedId: kb_id
      });
      
    } catch (error) {
      console.error("Delete knowledge base error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("删除知识库失败");
    }
  }
);

// 组合路由
const routes = knowledgeBase
  .route("/", createRoute)
  .route("/", listRoute)
  .route("/", getRoute)
  .route("/", updateRoute)
  .route("/", deleteRoute);

export { routes as knowledgeBase };
export type KnowledgeBaseType = typeof routes;