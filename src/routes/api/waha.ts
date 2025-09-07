import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, sql, count } from "drizzle-orm";
import type { Env } from "../../index";
import * as schema from "../../../database/schema";
import { ApiErrors } from "../../middleware/error-handler";
import { WAHAClient } from "../../services/waha";
import { generateId } from "../../utils/id";
// Note: Using Web Crypto API instead of Node.js crypto

const waha = new Hono<{ Bindings: Env }>();

// 检查用户WhatsApp会话配额
async function checkUserQuota(db: ReturnType<typeof drizzle>, userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  // 获取用户信息和配额
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId)
  });
  
  if (!user) {
    throw ApiErrors.NotFound("用户不存在");
  }

  // 获取当前用户的WhatsApp会话数量
  const currentSessionsResult = await db
    .select({ count: sql`count(*)` })
    .from(schema.waSessions)
    .where(eq(schema.waSessions.userId, userId));
  
  const currentSessions = Number(currentSessionsResult[0]?.count || 0);
  
  return {
    allowed: currentSessions < user.waLimit,
    current: currentSessions,
    limit: user.waLimit
  };
}

// 创建 WhatsApp 会话
const createSessionRoute = waha.post(
  "/sessions",
  zValidator("json", z.object({
    waAccountId: z.string().min(1, "WhatsApp 账号ID不能为空"),
    wahaApiUrl: z.string().url("请输入有效的 WAHA API URL"),
    wahaApiKey: z.string().min(1, "WAHA API Key不能为空"),
    agentId: z.string().optional(),
  })),
  async (c) => {
    const { waAccountId, wahaApiUrl, wahaApiKey, agentId } = c.req.valid("json");
    const db = drizzle(c.env.DB, { schema });

    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      // 检查用户WhatsApp配额
      const quotaCheck = await checkUserQuota(db, userId);
      if (!quotaCheck.allowed) {
        throw ApiErrors.BadRequest(
          `WhatsApp 会话数量已达上限 (${quotaCheck.current}/${quotaCheck.limit})，请升级套餐或删除现有会话`
        );
      }

      // 检查会话是否已存在
      const existingSession = await db.query.waSessions.findFirst({
        where: eq(schema.waSessions.waAccountId, waAccountId)
      });

      if (existingSession) {
        throw ApiErrors.BadRequest("该 WhatsApp 账号已存在会话");
      }

      // 如果指定了智能体，检查是否存在
      if (agentId) {
        const agent = await db.query.agents.findFirst({
          where: and(
            eq(schema.agents.id, agentId),
            eq(schema.agents.userId, userId)
          )
        });
        if (!agent) {
          throw ApiErrors.NotFound("指定的智能体不存在");
        }
      }

      // 生成会话ID和webhook密钥
      const sessionId = generateId("wa_session");
      const webhookSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      // 创建 WAHA 客户端
      const wahaClient = new WAHAClient(wahaApiUrl, wahaApiKey);

      // 配置 webhook URL（需要配置实际的域名）
      const webhookUrl = `https://your-domain.com/api/webhooks/waha/${waAccountId}`;

      // 创建 WAHA 会话
      const result = await wahaClient.createSession(waAccountId, {
        url: webhookUrl,
        events: ["message", "session.status"],
        secret: webhookSecret
      });

      // 保存会话到数据库
      const now = new Date();
      const [session] = await db
        .insert(schema.waSessions)
        .values({
          id: sessionId,
          userId,
          waAccountId,
          agentId: agentId || null,
          wahaApiUrl,
          wahaApiKey, // TODO: 加密存储
          webhookSecret,
          qrCode: result.qrCode || null,
          status: result.status as any || "connecting",
          createdAt: now,
          updatedAt: now
        })
        .returning();

      return c.json({
        success: true,
        data: {
          sessionId: session.id,
          waAccountId: session.waAccountId,
          agentId: session.agentId || undefined,
          status: session.status,
          qrCode: session.qrCode || undefined,
          createdAt: session.createdAt
        }
      }, 201);

    } catch (error: any) {
      if (error.status) throw error; // Re-throw API errors
      console.error("Failed to create WAHA session:", error);
      throw ApiErrors.InternalServerError("创建 WhatsApp 会话失败");
    }
  }
);

// 获取会话列表
const listSessionsRoute = waha.get(
  "/sessions",
  zValidator("query", z.object({
    page: z.string().optional().default("1").transform(Number),
    limit: z.string().optional().default("20").transform(Number),
    status: z.enum(["connecting", "scan_qr_code", "working", "failed", "stopped"]).optional(),
  })),
  async (c) => {
    const { page, limit, status } = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    const offset = (page - 1) * limit;

    try {
      let whereCondition: any = eq(schema.waSessions.userId, userId);
      if (status) {
        whereCondition = and(whereCondition, eq(schema.waSessions.status, status));
      }

      const sessions = await db.query.waSessions.findMany({
        where: whereCondition,
        with: {
          agent: true
        },
        orderBy: [desc(schema.waSessions.updatedAt)],
        limit,
        offset
      });

      const totalResult = await db
        .select({ count: sql`count(*)` })
        .from(schema.waSessions)
        .where(whereCondition);

      const total = Number(totalResult[0]?.count || 0);

      const sessionList = sessions.map(session => ({
        sessionId: session.id,
        waAccountId: session.waAccountId,
        agentId: session.agentId,
        agentName: session.agent?.name,
        status: session.status,
        autoReplyState: session.autoReplyState,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));

      return c.json({
        success: true,
        data: {
          sessions: sessionList,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error: any) {
      console.error("Failed to list WAHA sessions:", error);
      throw ApiErrors.InternalServerError("获取会话列表失败");
    }
  }
);

// 获取会话详情和状态
const getSessionRoute = waha.get(
  "/sessions/:sessionId",
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        ),
        with: {
          agent: true
        }
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      // 从 WAHA 获取最新状态
      let latestStatus = session.status;
      let qrCode = session.qrCode;
      
      try {
        const wahaClient = new WAHAClient(session.wahaApiUrl, session.wahaApiKey);
        const status = await wahaClient.getSessionStatus(session.waAccountId);
        latestStatus = status.status as any;
        if (status.qrCode) {
          qrCode = status.qrCode;
        }

        // 如果状态有变化，更新数据库
        if (latestStatus !== session.status || qrCode !== session.qrCode) {
          await db
            .update(schema.waSessions)
            .set({
              status: latestStatus,
              qrCode,
              updatedAt: new Date()
            })
            .where(eq(schema.waSessions.id, sessionId));
        }
      } catch (wahaError) {
        console.warn("Failed to get latest status from WAHA:", wahaError);
      }

      return c.json({
        success: true,
        data: {
          sessionId: session.id,
          waAccountId: session.waAccountId,
          agentId: session.agentId,
          agentName: session.agent?.name,
          status: latestStatus,
          qrCode,
          autoReplyState: session.autoReplyState,
          wahaApiUrl: session.wahaApiUrl,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to get WAHA session:", error);
      throw ApiErrors.InternalServerError("获取会话详情失败");
    }
  }
);

// 重启会话
const restartSessionRoute = waha.post(
  "/sessions/:sessionId/restart",
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        )
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      const wahaClient = new WAHAClient(session.wahaApiUrl, session.wahaApiKey);
      await wahaClient.restartSession(session.waAccountId);

      // 更新状态为重连中
      await db
        .update(schema.waSessions)
        .set({
          status: "connecting",
          qrCode: null,
          updatedAt: new Date()
        })
        .where(eq(schema.waSessions.id, sessionId));

      return c.json({
        success: true,
        message: "会话重启成功"
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to restart WAHA session:", error);
      throw ApiErrors.InternalServerError("重启会话失败");
    }
  }
);

// 删除会话
const deleteSessionRoute = waha.delete(
  "/sessions/:sessionId",
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        )
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      // TODO: 这里应该先停止 WAHA 会话，但需要 WAHA API 支持
      // const wahaClient = new WAHAClient(session.wahaApiUrl, session.wahaApiKey);
      // await wahaClient.deleteSession(session.waAccountId);

      // 删除相关的对话和消息数据（级联删除）
      await db.delete(schema.messages).where(
        eq(schema.messages.chatKey, session.waAccountId)
      );
      await db.delete(schema.jobs).where(
        eq(schema.jobs.chatKey, session.waAccountId)
      );
      await db.delete(schema.conversations).where(
        eq(schema.conversations.waAccountId, session.waAccountId)
      );
      
      // 删除会话
      await db.delete(schema.waSessions).where(
        eq(schema.waSessions.id, sessionId)
      );

      return c.json({
        success: true,
        message: "会话删除成功"
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to delete WAHA session:", error);
      throw ApiErrors.InternalServerError("删除会话失败");
    }
  }
);

// 更新自动回复状态
const updateAutoReplyRoute = waha.patch(
  "/sessions/:sessionId/auto-reply",
  zValidator("json", z.object({
    enabled: z.boolean()
  })),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const { enabled } = c.req.valid("json");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        )
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      await db
        .update(schema.waSessions)
        .set({
          autoReplyState: enabled,
          updatedAt: new Date()
        })
        .where(eq(schema.waSessions.id, sessionId));

      return c.json({
        success: true,
        message: `自动回复已${enabled ? '开启' : '关闭'}`
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to update auto-reply state:", error);
      throw ApiErrors.InternalServerError("更新自动回复状态失败");
    }
  }
);

// 获取QR码
const getQRCodeRoute = waha.get(
  "/sessions/:sessionId/qr",
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        )
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      const wahaClient = new WAHAClient(session.wahaApiUrl, session.wahaApiKey);
      const qrCode = await wahaClient.getQRCode(session.waAccountId);

      // 更新数据库中的 QR 码
      await db
        .update(schema.waSessions)
        .set({
          qrCode,
          updatedAt: new Date()
        })
        .where(eq(schema.waSessions.id, sessionId));

      return c.json({
        success: true,
        data: {
          qrCode
        }
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to get QR code:", error);
      throw ApiErrors.InternalServerError("获取二维码失败");
    }
  }
);

// 测试 WAHA API 连接
const testConnectionRoute = waha.post(
  "/test-connection",
  zValidator("json", z.object({
    wahaApiUrl: z.string().url("请输入有效的 WAHA API URL"),
    wahaApiKey: z.string().min(1, "WAHA API Key不能为空"),
    minVersion: z.string().optional().default("2.0.0")
  })),
  async (c) => {
    const { wahaApiUrl, wahaApiKey, minVersion } = c.req.valid("json");

    try {
      const wahaClient = new WAHAClient(wahaApiUrl, wahaApiKey, {
        timeoutMs: 10000 // 10 秒超时
      });

      // 检查版本
      await wahaClient.ensureVersion(minVersion);

      return c.json({
        success: true,
        message: "WAHA API 连接测试成功",
        data: {
          apiUrl: wahaApiUrl,
          minVersion
        }
      });

    } catch (error: any) {
      console.error("WAHA connection test failed:", error);
      return c.json({
        success: false,
        message: `连接测试失败: ${error.message}`,
        error: {
          code: error.status || "CONNECTION_ERROR",
          details: error.message
        }
      }, 400);
    }
  }
);

// 获取会话统计信息
const getSessionStatsRoute = waha.get(
  "/sessions/:sessionId/stats",
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        )
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      // 获取对话统计
      const conversations = await db.query.conversations.findMany({
        where: eq(schema.conversations.waAccountId, session.waAccountId)
      });

      const conversationIds = conversations.map(c => c.chatKey);

      // 获取消息统计
      const messageStats = conversationIds.length > 0 
        ? await db.query.messages.findMany({
            where: (table, { inArray }) => inArray(table.chatKey, conversationIds)
          })
        : [];

      const totalMessages = messageStats.length;
      const userMessages = messageStats.filter(m => m.role === "user").length;
      const assistantMessages = messageStats.filter(m => m.role === "assistant").length;
      const completedMessages = messageStats.filter(m => m.status === "completed").length;
      const failedMessages = messageStats.filter(m => m.status === "failed").length;

      return c.json({
        success: true,
        data: {
          sessionInfo: {
            sessionId: session.id,
            waAccountId: session.waAccountId,
            status: session.status,
            createdAt: session.createdAt
          },
          stats: {
            totalConversations: conversations.length,
            totalMessages,
            userMessages,
            assistantMessages,
            completedMessages,
            failedMessages,
            successRate: totalMessages > 0 ? completedMessages / totalMessages : 0
          }
        }
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to get session stats:", error);
      throw ApiErrors.InternalServerError("获取会话统计失败");
    }
  }
);

// QR码轮询 - 客户端可以定期调用此端点获取最新状态和QR码
const pollQRCodeRoute = waha.get(
  "/sessions/:sessionId/poll",
  zValidator("query", z.object({
    timeout: z.string().optional().default("30").transform(Number) // 轮询超时时间（秒）
  })),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const { timeout } = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const session = await db.query.waSessions.findFirst({
        where: and(
          eq(schema.waSessions.id, sessionId),
          eq(schema.waSessions.userId, userId)
        )
      });

      if (!session) {
        throw ApiErrors.NotFound("会话不存在");
      }

      const wahaClient = new WAHAClient(session.wahaApiUrl, session.wahaApiKey, {
        timeoutMs: Math.min(timeout * 1000, 60000) // 最多60秒
      });

      let attempts = 0;
      const maxAttempts = Math.max(1, timeout / 5); // 每5秒检查一次
      let latestStatus = session.status;
      let qrCode = session.qrCode;

      // 轮询直到状态改变或超时
      while (attempts < maxAttempts) {
        try {
          const status = await wahaClient.getSessionStatus(session.waAccountId);
          latestStatus = status.status as any;
          
          if (status.qrCode) {
            qrCode = status.qrCode;
          }

          // 如果状态不是 connecting 或 scan_qr_code，说明已连接或失败
          if (latestStatus !== "connecting" && latestStatus !== "scan_qr_code") {
            break;
          }

          // 如果是扫码状态且有新QR码，也返回
          if (latestStatus === "scan_qr_code" && qrCode && qrCode !== session.qrCode) {
            break;
          }

          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
          }
        } catch (pollError) {
          console.warn(`Polling attempt ${attempts + 1} failed:`, pollError);
          attempts++;
        }
      }

      // 更新数据库中的状态
      if (latestStatus !== session.status || qrCode !== session.qrCode) {
        await db
          .update(schema.waSessions)
          .set({
            status: latestStatus,
            qrCode,
            updatedAt: new Date()
          })
          .where(eq(schema.waSessions.id, sessionId));
      }

      return c.json({
        success: true,
        data: {
          sessionId,
          status: latestStatus,
          qrCode,
          statusChanged: latestStatus !== session.status,
          qrChanged: qrCode !== session.qrCode,
          pollingAttempts: attempts
        }
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to poll session status:", error);
      throw ApiErrors.InternalServerError("轮询会话状态失败");
    }
  }
);

// 会话健康检查
const healthCheckRoute = waha.get(
  "/sessions/health",
  zValidator("query", z.object({
    checkWaha: z.string().optional().default("true").transform(val => val === "true")
  })),
  async (c) => {
    const { checkWaha } = c.req.valid("query");
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      // 获取用户所有会话
      const sessions = await db.query.waSessions.findMany({
        where: eq(schema.waSessions.userId, userId),
        orderBy: [desc(schema.waSessions.updatedAt)]
      });

      const healthResults = [];

      // 检查每个会话的健康状态
      for (const session of sessions) {
        const result: any = {
          sessionId: session.id,
          waAccountId: session.waAccountId,
          dbStatus: session.status,
          healthy: true,
          lastUpdated: session.updatedAt,
          issues: []
        };

        // 检查会话是否长时间未更新
        const lastUpdateTime = new Date(session.updatedAt || new Date()).getTime();
        const now = Date.now();
        const hourssSinceUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);

        if (hourssSinceUpdate > 24) {
          result.issues.push(`会话超过24小时未更新 (${hourssSinceUpdate.toFixed(1)}小时)`);
          result.healthy = false;
        }

        // 如果需要检查WAHA状态
        if (checkWaha && session.status !== "stopped") {
          try {
            const wahaClient = new WAHAClient(session.wahaApiUrl, session.wahaApiKey, {
              timeoutMs: 5000 // 5秒超时
            });
            
            const wahaStatus = await wahaClient.getSessionStatus(session.waAccountId);
            result.wahaStatus = wahaStatus.status;
            
            // 检查数据库状态与WAHA状态是否一致
            if (wahaStatus.status !== session.status) {
              result.issues.push(`状态不一致: DB(${session.status}) vs WAHA(${wahaStatus.status})`);
              result.healthy = false;
            }
          } catch (wahaError: any) {
            result.issues.push(`WAHA连接失败: ${wahaError.message}`);
            result.healthy = false;
            result.wahaError = wahaError.message;
          }
        }

        healthResults.push(result);
      }

      const totalSessions = sessions.length;
      const healthySessions = healthResults.filter(r => r.healthy).length;
      const unhealthySessions = totalSessions - healthySessions;

      return c.json({
        success: true,
        data: {
          summary: {
            totalSessions,
            healthySessions,
            unhealthySessions,
            healthRate: totalSessions > 0 ? healthySessions / totalSessions : 1
          },
          sessions: healthResults,
          checkedAt: new Date()
        }
      });

    } catch (error: any) {
      console.error("Health check failed:", error);
      throw ApiErrors.InternalServerError("健康检查失败");
    }
  }
);

// 用户配额信息
const getUserQuotaRoute = waha.get(
  "/quota",
  async (c) => {
    const db = drizzle(c.env.DB, { schema });
    
    // TODO: 获取当前用户ID（认证系统集成后）
    const userId = "test-user-1";

    try {
      const quotaCheck = await checkUserQuota(db, userId);
      
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId)
      });

      return c.json({
        success: true,
        data: {
          userId: user?.id,
          whatsapp: {
            current: quotaCheck.current,
            limit: quotaCheck.limit,
            available: quotaCheck.limit - quotaCheck.current,
            utilizationRate: quotaCheck.limit > 0 ? quotaCheck.current / quotaCheck.limit : 0
          },
          otherLimits: {
            knowledgeBase: {
              limit: user?.kbLimit || 0
            },
            agents: {
              limit: user?.agentLimit || 0
            }
          }
        }
      });

    } catch (error: any) {
      if (error.status) throw error;
      console.error("Failed to get user quota:", error);
      throw ApiErrors.InternalServerError("获取用户配额失败");
    }
  }
);

// 组合所有路由
export const wahaRoutes = waha
  .route("/", createSessionRoute)
  .route("/", listSessionsRoute)
  .route("/", getSessionRoute)
  .route("/", restartSessionRoute)
  .route("/", deleteSessionRoute)
  .route("/", updateAutoReplyRoute)
  .route("/", getQRCodeRoute)
  .route("/", testConnectionRoute)
  .route("/", getSessionStatsRoute)
  .route("/", pollQRCodeRoute)
  .route("/", healthCheckRoute)
  .route("/", getUserQuotaRoute);

export { wahaRoutes as waha };