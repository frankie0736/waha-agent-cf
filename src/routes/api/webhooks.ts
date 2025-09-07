import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../../index";
import * as schema from "../../../database/schema";
import { ApiErrors } from "../../middleware/error-handler";
import { WAHAClient } from "../../services/waha";

const webhooks = new Hono<{ Bindings: Env }>();

// WAHA Webhook 接收端点
const wahaWebhookRoute = webhooks.post(
  "/waha/:waAccountId",
  async (c) => {
    const waAccountId = c.req.param("waAccountId");
    const body = await c.req.text();
    const signature = c.req.header("x-hub-signature-256") || c.req.header("x-signature");

    const db = drizzle(c.env.DB, { schema });

    try {
      // 查找会话配置
      const session = await db.query.waSessions.findFirst({
        where: eq(schema.waSessions.waAccountId, waAccountId)
      });

      if (!session) {
        console.warn(`Webhook received for unknown session: ${waAccountId}`);
        return c.json({ error: "Session not found" }, 404);
      }

      // 验证 webhook 签名（如果配置了密钥）
      if (session.webhookSecret && signature) {
        const isValid = await WAHAClient.verifyWebhookSignature(
          signature.replace("sha256=", ""), // 移除前缀
          body,
          session.webhookSecret
        );

        if (!isValid) {
          console.warn(`Invalid webhook signature for session: ${waAccountId}`);
          return c.json({ error: "Invalid signature" }, 401);
        }
      }

      // 解析 webhook 数据
      let webhookData: any;
      try {
        webhookData = JSON.parse(body);
      } catch (error) {
        console.error("Failed to parse webhook body:", error);
        return c.json({ error: "Invalid JSON" }, 400);
      }

      // 处理不同类型的事件
      const eventType = webhookData.event || webhookData.type;
      
      switch (eventType) {
        case "message":
          await handleMessageEvent(db, session, webhookData);
          break;
        
        case "session.status":
          await handleSessionStatusEvent(db, session, webhookData);
          break;
        
        default:
          console.log(`Unhandled webhook event type: ${eventType}`, webhookData);
      }

      // 快速响应，避免超时
      return c.json({ success: true }, 200);

    } catch (error) {
      console.error("Webhook processing error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

// 处理消息事件
async function handleMessageEvent(
  db: ReturnType<typeof drizzle>,
  session: any,
  webhookData: any
): Promise<void> {
  try {
    const message = webhookData.payload || webhookData.data;
    if (!message) return;

    // 构建聊天键
    const chatKey = `${session.waAccountId}:${message.from}`;
    
    // 只处理用户发来的消息，忽略机器人发出的消息
    if (message.fromMe) return;

    // 检查自动回复是否开启
    if (!session.autoReplyState) {
      console.log(`Auto-reply disabled for session: ${session.waAccountId}`);
      return;
    }

    // 获取或创建对话记录
    let conversation = await db.query.conversations.findFirst({
      where: eq(schema.conversations.chatKey, chatKey)
    });

    if (!conversation) {
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
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

    // 这里应该触发消息处理队列
    // TODO: 实现队列触发逻辑
    console.log(`New message received for ${chatKey}, turn ${turn}`);

  } catch (error) {
    console.error("Failed to handle message event:", error);
  }
}

// 处理会话状态事件
async function handleSessionStatusEvent(
  db: ReturnType<typeof drizzle>,
  session: any,
  webhookData: any
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

      console.log(`Session ${session.waAccountId} status updated to: ${newStatus}`);
    }

  } catch (error) {
    console.error("Failed to handle session status event:", error);
  }
}

// Webhook 测试端点
const testWebhookRoute = webhooks.post(
  "/test",
  zValidator("json", z.object({
    waAccountId: z.string(),
    event: z.string(),
    payload: z.any().optional()
  })),
  async (c) => {
    const { waAccountId, event, payload } = c.req.valid("json");

    // 模拟 webhook 调用
    const testData = {
      event,
      payload: payload || {
        body: "Test message",
        from: "test@c.us",
        fromMe: false,
        timestamp: Date.now()
      }
    };

    try {
      const response = await fetch(`${c.req.url.replace('/test', '')}/waha/${waAccountId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(testData)
      });

      return c.json({
        success: true,
        message: "Webhook test sent",
        response: {
          status: response.status,
          statusText: response.statusText
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

// 组合所有路由
export const webhookRoutes = webhooks
  .route("/", wahaWebhookRoute)
  .route("/", testWebhookRoute);

export { webhookRoutes as webhooks };