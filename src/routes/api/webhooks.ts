import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../../index";
import * as schema from "../../../database/schema";
import { ApiErrors } from "../../middleware/error-handler";
import { WAHAClient } from "../../services/waha";
import { generateId } from "../../utils/id";

const webhooks = new Hono<{ Bindings: Env }>();

// Webhook 监控指标
interface WebhookMetrics {
  requestId: string;
  sessionId: string;
  eventType: string;
  receivedAt: number;
  processedAt?: number;
  responseTime?: number;
  status: 'received' | 'processing' | 'completed' | 'failed';
  error?: string;
}

// 幂等性检查（使用 KV 存储，TTL 24小时）
async function checkIdempotency(kv: KVNamespace, messageId: string): Promise<boolean> {
  const key = `webhook:idempotency:${messageId}`;
  const existing = await kv.get(key);
  
  if (existing) {
    return false; // 已处理过
  }
  
  // 设置键值，TTL 24小时
  await kv.put(key, JSON.stringify({
    processedAt: new Date().toISOString(),
    timestamp: Date.now()
  }), {
    expirationTtl: 86400 // 24 hours in seconds
  });
  
  return true; // 新消息，可以处理
}

// 保存 Webhook 监控指标
async function saveWebhookMetrics(kv: KVNamespace, metrics: WebhookMetrics): Promise<void> {
  const key = `webhook:metrics:${metrics.requestId}`;
  await kv.put(key, JSON.stringify(metrics), {
    expirationTtl: 604800 // 7 days
  });
  
  // 更新每日统计
  const dailyKey = `webhook:stats:${new Date().toISOString().split('T')[0]}`;
  const stats = await kv.get(dailyKey);
  const dailyStats = stats ? JSON.parse(stats) : { 
    total: 0, 
    success: 0, 
    failed: 0,
    avgResponseTime: 0,
    events: {}
  };
  
  dailyStats.total++;
  if (metrics.status === 'completed') dailyStats.success++;
  if (metrics.status === 'failed') dailyStats.failed++;
  
  // 更新事件类型统计
  dailyStats.events[metrics.eventType] = (dailyStats.events[metrics.eventType] || 0) + 1;
  
  // 更新平均响应时间
  if (metrics.responseTime) {
    dailyStats.avgResponseTime = 
      (dailyStats.avgResponseTime * (dailyStats.total - 1) + metrics.responseTime) / dailyStats.total;
  }
  
  await kv.put(dailyKey, JSON.stringify(dailyStats), {
    expirationTtl: 2592000 // 30 days
  });
}

// WAHA Webhook 接收端点（优化版）
const wahaWebhookRoute = webhooks.post(
  "/waha/:waAccountId",
  async (c) => {
    const startTime = Date.now();
    const waAccountId = c.req.param("waAccountId");
    const requestId = generateId("webhook");
    
    // 初始化监控指标
    const metrics: WebhookMetrics = {
      requestId,
      sessionId: waAccountId,
      eventType: 'unknown',
      receivedAt: startTime,
      status: 'received'
    };

    try {
      // 快速读取请求体
      const body = await c.req.text();
      const signature = c.req.header("x-hub-signature-256") || c.req.header("x-signature");
      
      // 解析 webhook 数据（优化：先解析再验证，以获取 messageId）
      let webhookData: any;
      try {
        webhookData = JSON.parse(body);
        metrics.eventType = webhookData.event || webhookData.type || 'unknown';
      } catch (error) {
        console.error(`[${requestId}] Failed to parse webhook body:`, error);
        metrics.status = 'failed';
        metrics.error = 'Invalid JSON';
        await saveWebhookMetrics(c.env.KV, metrics);
        return c.json({ error: "Invalid JSON" }, 400);
      }

      // 幂等性检查（使用消息 ID 或生成唯一标识）
      const messageId = webhookData.payload?.id || 
                       webhookData.data?.id || 
                       `${waAccountId}:${webhookData.timestamp || Date.now()}`;
      
      const isNew = await checkIdempotency(c.env.KV, messageId);
      if (!isNew) {
        console.log(`[${requestId}] Duplicate webhook ignored: ${messageId}`);
        metrics.status = 'completed';
        metrics.responseTime = Date.now() - startTime;
        await saveWebhookMetrics(c.env.KV, metrics);
        return c.json({ success: true, duplicate: true }, 200);
      }

      // 快速响应，异步处理（使用 waitUntil 确保处理完成）
      c.executionCtx.waitUntil(
        processWebhookAsync(c.env, requestId, waAccountId, body, signature, webhookData, metrics)
      );

      // 立即返回成功响应（优化响应时间）
      const responseTime = Date.now() - startTime;
      console.log(`[${requestId}] Webhook acknowledged in ${responseTime}ms`);
      
      return c.json({ 
        success: true, 
        requestId,
        acknowledgedIn: responseTime 
      }, 200);

    } catch (error: any) {
      metrics.status = 'failed';
      metrics.error = error.message;
      metrics.responseTime = Date.now() - startTime;
      await saveWebhookMetrics(c.env.KV, metrics);
      
      console.error(`[${requestId}] Webhook processing error:`, error);
      return c.json({ 
        error: "Internal server error",
        requestId 
      }, 500);
    }
  }
);

// 异步处理 Webhook（后台执行）
async function processWebhookAsync(
  env: Env,
  requestId: string,
  waAccountId: string,
  body: string,
  signature: string | undefined,
  webhookData: any,
  metrics: WebhookMetrics
): Promise<void> {
  const processingStart = Date.now();
  metrics.status = 'processing';
  
  try {
    const db = drizzle(env.DB, { schema });
    
    // 查找会话配置
    const session = await db.query.waSessions.findFirst({
      where: eq(schema.waSessions.waAccountId, waAccountId)
    });

    if (!session) {
      console.warn(`[${requestId}] Webhook received for unknown session: ${waAccountId}`);
      metrics.status = 'failed';
      metrics.error = 'Session not found';
      return;
    }

    // 验证 webhook 签名
    if (session.webhookSecret && signature) {
      const isValid = await WAHAClient.verifyWebhookSignature(
        signature.replace("sha256=", ""),
        body,
        session.webhookSecret
      );

      if (!isValid) {
        console.warn(`[${requestId}] Invalid webhook signature for session: ${waAccountId}`);
        metrics.status = 'failed';
        metrics.error = 'Invalid signature';
        return;
      }
    }

    // 处理不同类型的事件
    const eventType = webhookData.event || webhookData.type;
    console.log(`[${requestId}] Processing ${eventType} event for session ${waAccountId}`);
    
    switch (eventType) {
      case "message":
        await handleMessageEvent(db, session, webhookData, requestId);
        break;
      
      case "session.status":
        await handleSessionStatusEvent(db, session, webhookData, requestId);
        break;
      
      case "message.ack":
        // 消息已读回执
        await handleMessageAckEvent(db, session, webhookData, requestId);
        break;
        
      case "call.received":
      case "call.accepted":
      case "call.rejected":
        // 通话事件
        await handleCallEvent(db, session, webhookData, requestId);
        break;
      
      default:
        console.log(`[${requestId}] Unhandled webhook event type: ${eventType}`, webhookData);
    }

    metrics.status = 'completed';
    metrics.processedAt = Date.now();
    metrics.responseTime = Date.now() - metrics.receivedAt;
    
    console.log(`[${requestId}] Webhook processed successfully in ${Date.now() - processingStart}ms`);
    
  } catch (error: any) {
    metrics.status = 'failed';
    metrics.error = error.message;
    console.error(`[${requestId}] Webhook async processing failed:`, error);
  } finally {
    // 保存最终指标
    await saveWebhookMetrics(env.KV, metrics);
  }
}

// 处理消息事件（优化版）
async function handleMessageEvent(
  db: ReturnType<typeof drizzle>,
  session: any,
  webhookData: any,
  requestId: string
): Promise<void> {
  try {
    const message = webhookData.payload || webhookData.data;
    if (!message) return;

    // 构建聊天键
    const chatKey = `${session.waAccountId}:${message.from}`;
    
    // 只处理用户发来的消息，忽略机器人发出的消息
    if (message.fromMe) {
      console.log(`[${requestId}] Ignoring outgoing message`);
      return;
    }

    // 检查自动回复是否开启
    if (!session.autoReplyState) {
      console.log(`[${requestId}] Auto-reply disabled for session: ${session.waAccountId}`);
      return;
    }

    // 获取或创建对话记录
    let conversation = await db.query.conversations.findFirst({
      where: eq(schema.conversations.chatKey, chatKey)
    });

    if (!conversation) {
      const conversationId = generateId("conv");
      const [newConversation] = await db
        .insert(schema.conversations)
        .values({
          id: conversationId,
          waAccountId: session.waAccountId,
          chatKey,
          lastTurn: 0,
          autoReplyState: true,
          updatedAt: new Date()
        })
        .returning();
      conversation = newConversation;
    }

    // 保存用户消息
    const turn = conversation.lastTurn + 1;
    const messageId = generateId("msg");
    
    await db.insert(schema.messages).values({
      id: messageId,
      chatKey,
      turn,
      role: "user",
      text: message.body || message.text || "",
      status: "pending",
      ts: new Date()
    });

    // 更新对话的最后回合
    await db
      .update(schema.conversations)
      .set({
        lastTurn: turn,
        updatedAt: new Date()
      })
      .where(eq(schema.conversations.id, conversation.id));

    // TODO: 触发消息处理队列 (T016-T018)
    console.log(`[${requestId}] Message saved: ${chatKey}, turn ${turn}, messageId: ${messageId}`);

  } catch (error) {
    console.error(`[${requestId}] Failed to handle message event:`, error);
    throw error;
  }
}

// 处理会话状态事件
async function handleSessionStatusEvent(
  db: ReturnType<typeof drizzle>,
  session: any,
  webhookData: any,
  requestId: string
): Promise<void> {
  try {
    const status = webhookData.payload || webhookData.data;
    if (!status) return;

    const newStatus = status.status;
    const qrCode = status.qr || status.qrCode;

    // 更新会话状态
    if (newStatus && newStatus !== session.status) {
      await db
        .update(schema.waSessions)
        .set({
          status: newStatus,
          ...(qrCode && { qrCode }),
          updatedAt: new Date()
        })
        .where(eq(schema.waSessions.id, session.id));

      console.log(`[${requestId}] Session ${session.waAccountId} status updated to: ${newStatus}`);
    }

  } catch (error) {
    console.error(`[${requestId}] Failed to handle session status event:`, error);
    throw error;
  }
}

// 处理消息已读回执
async function handleMessageAckEvent(
  db: ReturnType<typeof drizzle>,
  session: any,
  webhookData: any,
  requestId: string
): Promise<void> {
  try {
    const ack = webhookData.payload || webhookData.data;
    if (!ack) return;
    
    // 更新消息状态为已读
    console.log(`[${requestId}] Message acknowledged: ${ack.id}, status: ${ack.ackStatus}`);
    
    // TODO: 更新数据库中的消息状态
    
  } catch (error) {
    console.error(`[${requestId}] Failed to handle message ack event:`, error);
  }
}

// 处理通话事件
async function handleCallEvent(
  db: ReturnType<typeof drizzle>,
  session: any,
  webhookData: any,
  requestId: string
): Promise<void> {
  try {
    const call = webhookData.payload || webhookData.data;
    if (!call) return;
    
    console.log(`[${requestId}] Call event: ${webhookData.event}, from: ${call.from}`);
    
    // TODO: 实现通话事件处理逻辑
    // 可以发送自动回复消息告知用户当前无法接听等
    
  } catch (error) {
    console.error(`[${requestId}] Failed to handle call event:`, error);
  }
}

// Webhook 测试端点（增强版）
const testWebhookRoute = webhooks.post(
  "/test",
  zValidator("json", z.object({
    waAccountId: z.string(),
    event: z.string(),
    payload: z.any().optional(),
    signature: z.string().optional()
  })),
  async (c) => {
    const { waAccountId, event, payload, signature } = c.req.valid("json");

    // 模拟 webhook 调用
    const testData = {
      event,
      timestamp: Date.now(),
      payload: payload || {
        id: generateId("test"),
        body: "Test message",
        from: "test@c.us",
        fromMe: false,
        timestamp: Date.now()
      }
    };

    try {
      const webhookUrl = new URL(c.req.url);
      webhookUrl.pathname = `/api/webhooks/waha/${waAccountId}`;
      
      const headers: HeadersInit = {
        "Content-Type": "application/json"
      };
      
      if (signature) {
        headers["x-hub-signature-256"] = signature;
      }
      
      const response = await fetch(webhookUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(testData)
      });

      const result = await response.json();

      return c.json({
        success: true,
        message: "Webhook test sent",
        response: {
          status: response.status,
          statusText: response.statusText,
          body: result
        }
      });

    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }
  }
);

// Webhook 监控端点
const webhookMonitorRoute = webhooks.get(
  "/monitor",
  zValidator("query", z.object({
    date: z.string().optional(),
    sessionId: z.string().optional()
  })),
  async (c) => {
    const { date, sessionId } = c.req.valid("query");
    
    try {
      // 获取指定日期的统计（默认今天）
      const targetDate = date || new Date().toISOString().split('T')[0];
      const statsKey = `webhook:stats:${targetDate}`;
      const statsData = await c.env.KV.get(statsKey);
      const stats = statsData ? JSON.parse(statsData) : null;
      
      // 获取最近的 webhook 指标
      const recentMetrics: any[] = [];
      if (sessionId) {
        // TODO: 实现按 sessionId 查询最近的 webhook
      }
      
      return c.json({
        success: true,
        data: {
          date: targetDate,
          statistics: stats,
          recentWebhooks: recentMetrics,
          health: {
            status: stats && stats.failed / stats.total < 0.1 ? 'healthy' : 'degraded',
            successRate: stats ? (stats.success / stats.total * 100).toFixed(2) + '%' : 'N/A',
            avgResponseTime: stats ? stats.avgResponseTime.toFixed(2) + 'ms' : 'N/A'
          }
        }
      });
      
    } catch (error: any) {
      console.error("Failed to get webhook monitor data:", error);
      return c.json({
        success: false,
        error: error.message
      }, 500);
    }
  }
);

// Webhook 重试端点
const webhookRetryRoute = webhooks.post(
  "/retry/:requestId",
  async (c) => {
    const requestId = c.req.param("requestId");
    
    try {
      // 从 KV 获取原始 webhook 数据
      const metricsKey = `webhook:metrics:${requestId}`;
      const metricsData = await c.env.KV.get(metricsKey);
      
      if (!metricsData) {
        throw ApiErrors.NotFound("Webhook request not found");
      }
      
      const metrics = JSON.parse(metricsData);
      
      // TODO: 实现重试逻辑
      
      return c.json({
        success: true,
        message: "Webhook retry initiated",
        originalRequest: metrics
      });
      
    } catch (error: any) {
      if (error.status) throw error;
      console.error("Webhook retry failed:", error);
      throw ApiErrors.InternalServerError("Failed to retry webhook");
    }
  }
);

// 组合所有路由
export const webhookRoutes = webhooks
  .route("/", wahaWebhookRoute)
  .route("/", testWebhookRoute)
  .route("/", webhookMonitorRoute)
  .route("/", webhookRetryRoute);

export { webhookRoutes as webhooks };