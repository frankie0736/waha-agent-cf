import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import type { IncomingRequestCfProperties, MessageBatch, ExecutionContext } from "@cloudflare/workers-types";
import { createAuth } from "./lib/auth";
import { authDemo } from "./routes/auth-demo";
import { api } from "./routes/api";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";
import "./types";

export interface Env {
  // Database
  DB: D1Database;

  // Storage
  KV: KVNamespace;
  R2: R2Bucket;

  // Vector search
  VECTORIZE: VectorizeIndex;

  // Durable Objects - T016 Message Merging
  CHAT_SESSIONS: DurableObjectNamespace;

  // Queues
  QUEUE_RETRIEVE: Queue<unknown>;
  QUEUE_INFER: Queue<unknown>;
  QUEUE_REPLY: Queue<unknown>;
  QUEUE_EMBED?: Queue;

  // Environment variables
  ENVIRONMENT: string;

  // Secrets (set via wrangler secret)
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ENCRYPTION_KEY?: string;
  ADMIN_EMAILS?: string;
  AIHUBMIX_API_KEY?: string;
  WAHA_API_URL?: string;
  WAHA_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global Middleware (order matters!)
app.use("*", requestLogger()); // 请求日志 - 最先执行
app.use("*", logger()); // Hono 内置日志
app.use("*", prettyJSON()); // JSON 美化
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Better Auth 处理器
app.all("/api/auth/*", async (c) => {
  const auth = createAuth(c.env, c.req.raw.cf as IncomingRequestCfProperties);
  return auth.handler(c.req.raw);
});

// 认证演示页面
app.route("/auth", authDemo);

// API 路由 - 使用类型安全的 RPC 模式
app.route("/api", api);

// Welcome message
app.get("/", (c) => {
  return c.json({
    message: "WA-Agent - 多租户 WhatsApp 智能客服平台",
    version: "1.0.0",
    environment: c.env.ENVIRONMENT,
    endpoints: {
      health: "/api/health",
      docs: "/docs",
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      message: "请求的资源不存在",
      status: 404,
    },
    404
  );
});

// Error handler - 使用自定义错误处理中间件
app.onError(errorHandler());

// Import queue handlers - T018
import { handleRetrieveQueue, handleInferQueue, handleReplyQueue } from "./queues";
import type { RetrieveQueueMessage, InferQueueMessage, ReplyQueueMessage } from "./queues";

// 导出 Durable Objects - T016
export { ChatSessionDO } from "./durable-objects/chat-session";

// 导出类型（用于 RPC 客户端）
export type AppType = typeof app;

// Queue handler export for Cloudflare Workers - Combined with app
export default {
  fetch: app.fetch,
  
  // Queue consumers - T018 Message Processing Queues
  async queue(
    batch: MessageBatch<RetrieveQueueMessage | InferQueueMessage | ReplyQueueMessage>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    // Route to appropriate handler based on queue name
    const queueName = batch.queue;
    
    console.log(`[Queue] Processing ${batch.messages.length} messages from queue: ${queueName}`);
    
    try {
      switch (queueName) {
        case 'waha-agent-retrieve':
          await handleRetrieveQueue(batch as MessageBatch<RetrieveQueueMessage>, env);
          break;
          
        case 'waha-agent-infer':
          await handleInferQueue(batch as MessageBatch<InferQueueMessage>, env);
          break;
          
        case 'waha-agent-reply':
          await handleReplyQueue(batch as MessageBatch<ReplyQueueMessage>, env);
          break;
          
        default:
          console.error(`Unknown queue: ${queueName}`);
      }
    } catch (error) {
      console.error(`[Queue] Error processing ${queueName}:`, error);
      // Cloudflare will automatically retry failed messages
      throw error;
    }
  }
};
