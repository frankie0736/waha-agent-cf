import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import * as schema from "../../../database/schema";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";

const documents = new Hono<{ Bindings: Env }>();

// 支持的文件类型和对应的 MIME 类型
const SUPPORTED_MIME_TYPES = {
  // 文本文件
  'text/plain': { ext: 'txt', category: 'text' },
  'text/markdown': { ext: 'md', category: 'text' },
  
  // PDF
  'application/pdf': { ext: 'pdf', category: 'pdf' },
  
  // Microsoft Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', category: 'document' },
  'application/msword': { ext: 'doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', category: 'spreadsheet' },
  'application/vnd.ms-excel': { ext: 'xls', category: 'spreadsheet' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', category: 'presentation' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', category: 'presentation' },
} as const;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * 生成安全的文件名
 */
function generateSafeFileName(originalName: string, userId: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${userId}/${timestamp}_${randomSuffix}_${sanitizedName}`;
}

/**
 * 验证文件类型和大小
 */
function validateFile(file: File): { isValid: boolean; error?: string; fileInfo?: any } {
  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `文件大小超过限制 (${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`
    };
  }

  // 检查文件类型
  if (!SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES]) {
    return {
      isValid: false,
      error: `不支持的文件格式: ${file.type}`
    };
  }

  const fileInfo = SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES];
  
  return {
    isValid: true,
    fileInfo: {
      mimeType: file.type,
      extension: fileInfo.ext,
      category: fileInfo.category,
      size: file.size
    }
  };
}

// 文档上传端点
const uploadRoute = documents.post(
  "/upload",
  zValidator(
    "form",
    z.object({
      file: z.instanceof(File),
      kb_id: z.string().uuid("知识库ID必须是有效的UUID"),
      description: z.string().optional(),
    })
  ),
  async (c) => {
    const { file, kb_id, description } = c.req.valid("form");
    
    // TODO: 验证用户权限和知识库所有权
    // const session = await getSession(c);
    // if (!session) throw ApiErrors.Unauthorized();
    
    // 临时使用测试用户ID
    const userId = "test-user-id";
    
    // 验证文件
    const validation = validateFile(file);
    if (!validation.isValid) {
      throw ApiErrors.ValidationError(validation.error!);
    }

    const db = drizzle(c.env.DB, { schema });
    
    try {
      // 验证知识库是否存在
      const kbSpace = await db.query.kbSpaces.findFirst({
        where: eq(schema.kbSpaces.id, kb_id)
      });
      
      if (!kbSpace) {
        throw ApiErrors.NotFound("知识库不存在");
      }

      // 生成安全的文件路径
      const r2Key = generateSafeFileName(file.name, userId);
      
      // 上传文件到 R2
      await c.env.R2.put(r2Key, file);
      
      // 创建文档记录
      const docId = crypto.randomUUID();
      const now = new Date();
      
      await db.insert(schema.kbDocuments).values({
        id: docId,
        kbId: kb_id,
        filename: file.name,
        filetype: validation.fileInfo!.mimeType,
        filesize: validation.fileInfo!.size,
        r2Key: r2Key,
        status: 'failed' as const,
        createdAt: now,
        updatedAt: now
      });

      return c.json({
        id: docId,
        filename: file.name,
        filesize: validation.fileInfo!.size,
        filetype: validation.fileInfo!.mimeType,
        category: validation.fileInfo!.category,
        status: 'processing',
        r2Key: r2Key,
        uploadedAt: new Date(now).toISOString()
      }, 201);

    } catch (error) {
      console.error("File upload error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("文件上传失败");
    }
  }
);

// 获取文档列表
const listRoute = documents.get(
  "/list/:kb_id",
  zValidator(
    "param",
    z.object({
      kb_id: z.string().uuid()
    })
  ),
  zValidator(
    "query", 
    z.object({
      limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default(20),
      offset: z.string().transform(Number).pipe(z.number().min(0)).default(0),
      status: z.enum(["processing", "completed", "failed"]).optional()
    })
  ),
  async (c) => {
    const { kb_id } = c.req.valid("param");
    const { limit, offset, status } = c.req.valid("query");
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      // 构建查询条件
      const conditions = [eq(schema.kbDocuments.kbId, kb_id)];
      if (status) {
        conditions.push(eq(schema.kbDocuments.status, status));
      }
      
      // 查询文档列表
      const documents = await db.query.kbDocuments.findMany({
        where: and(...conditions),
        limit,
        offset,
        orderBy: (docs, { desc }) => [desc(docs.createdAt)]
      });

      return c.json({
        documents: documents.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          filetype: doc.filetype,
          filesize: doc.filesize,
          status: doc.status,
          errorMessage: doc.errorMessage,
          createdAt: new Date(doc.createdAt).toISOString(),
          updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null
        })),
        pagination: {
          limit,
          offset,
          total: documents.length
        }
      });
    } catch (error) {
      console.error("List documents error:", error);
      throw ApiErrors.InternalServerError("获取文档列表失败");
    }
  }
);


// 获取支持的文件格式信息
const formatsRoute = documents.get("/supported-formats", (c) => {
  return c.json({
    supportedFormats: Object.entries(SUPPORTED_MIME_TYPES).map(([mimeType, info]) => ({
      mimeType,
      extension: info.ext,
      category: info.category
    })),
    maxFileSize: MAX_FILE_SIZE,
    maxFileSizeMB: Math.round(MAX_FILE_SIZE / 1024 / 1024)
  });
});

// 组合路由
const routes = documents
  .route("/", uploadRoute)
  .route("/", listRoute)
  .route("/", formatsRoute)
  .get("/:doc_id", async (c) => {
    const { doc_id } = c.req.param();
    
    if (!doc_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw ApiErrors.ValidationError("Invalid document ID format");
    }
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      const document = await db.query.kbDocuments.findFirst({
        where: eq(schema.kbDocuments.id, doc_id)
      });
      
      if (!document) {
        throw ApiErrors.NotFound("文档不存在");
      }

      // 单独获取知识库信息
      const kbSpace = await db.query.kbSpaces.findFirst({
        where: eq(schema.kbSpaces.id, document.kbId)
      });

      return c.json({
        id: document.id,
        filename: document.filename,
        filetype: document.filetype,
        filesize: document.filesize,
        status: document.status,
        errorMessage: document.errorMessage,
        r2Key: document.r2Key,
        kbSpace: kbSpace ? {
          id: kbSpace.id,
          name: kbSpace.name
        } : null,
        createdAt: new Date(document.createdAt).toISOString(),
        updatedAt: document.updatedAt ? new Date(document.updatedAt).toISOString() : null
      });

    } catch (error) {
      console.error("Get document error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("获取文档详情失败");
    }
  })
  .delete("/:doc_id", async (c) => {
    const { doc_id } = c.req.param();
    
    if (!doc_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw ApiErrors.ValidationError("Invalid document ID format");
    }
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      // 查找文档记录
      const document = await db.query.kbDocuments.findFirst({
        where: eq(schema.kbDocuments.id, doc_id)
      });
      
      if (!document) {
        throw ApiErrors.NotFound("文档不存在");
      }

      // 删除 R2 中的文件
      await c.env.R2.delete(document.r2Key);
      
      // 删除数据库记录
      await db.delete(schema.kbDocuments).where(eq(schema.kbDocuments.id, doc_id));
      
      // 删除相关的 chunks（如果有）
      await db.delete(schema.kbChunks).where(eq(schema.kbChunks.docId, doc_id));

      return c.json({
        message: "文档删除成功",
        deletedId: doc_id
      });

    } catch (error) {
      console.error("Delete document error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("文档删除失败");
    }
  })
  .post("/process/:doc_id", async (c) => {
    const { doc_id } = c.req.param();
    
    if (!doc_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw ApiErrors.ValidationError("Invalid document ID format");
    }
    
    const db = drizzle(c.env.DB, { schema });
    
    try {
      // Get document info
      const document = await db.query.kbDocuments.findFirst({
        where: eq(schema.kbDocuments.id, doc_id)
      });
      
      if (!document) {
        throw ApiErrors.NotFound("文档不存在");
      }

      if (document.status === 'processing') {
        throw ApiErrors.BadRequest("文档正在处理中，请稍后再试");
      }

      if (document.status === 'completed') {
        throw ApiErrors.BadRequest("文档已经处理完成");
      }

      // Get file from R2
      const r2Object = await c.env.R2.get(document.r2Key);
      if (!r2Object) {
        throw ApiErrors.NotFound("文件不存在");
      }

      const fileBuffer = await r2Object.arrayBuffer();
      
      // Import document processor
      const { documentProcessor } = await import('../../services/document-processor');
      
      // Process the document
      const result = await documentProcessor.processDocument(
        doc_id,
        document.kbId,
        fileBuffer,
        document.filename,
        document.filetype as any,
        db
      );

      if (!result.success) {
        throw ApiErrors.InternalServerError(`文档处理失败: ${result.error}`);
      }

      return c.json({
        message: "文档处理完成",
        docId: doc_id,
        chunks: result.chunks?.length || 0,
        metadata: result.metadata
      });

    } catch (error) {
      console.error("Document processing error:", error);
      if (error instanceof Error && error.message.includes("ApiError")) {
        throw error;
      }
      throw ApiErrors.InternalServerError("文档处理失败");
    }
  });

export { routes as documents };
export type DocumentsType = typeof routes;