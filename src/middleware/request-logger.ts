import type { Context, Next } from "hono";
import type { Env } from "../index";

/**
 * 请求日志数据接口
 */
interface RequestLog {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string | undefined;
  ip?: string | undefined;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  responseSize?: number;
  userId?: string;
  error?: string;
}

/**
 * 增强的请求日志中间件
 * 记录详细的请求信息和性能指标
 */
export function requestLogger() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substring(2)}`;
    
    // 设置请求ID到上下文
    (c as any).set("requestId", requestId);
    
    // 提取请求信息
    const method = c.req.method;
    const url = c.req.url;
    const userAgent = c.req.header("user-agent");
    const ip = c.req.header("cf-connecting-ip") || 
               c.req.header("x-forwarded-for") || 
               c.req.header("x-real-ip") ||
               "unknown";

    // 初始日志对象
    const logData: RequestLog = {
      requestId,
      method,
      url,
      userAgent: userAgent || undefined,
      ip: ip || undefined,
      startTime,
    };

    // 开发环境下打印请求开始日志
    if (c.env.ENVIRONMENT === "development") {
      console.log(`🚀 ${method} ${url} [${requestId}]`);
    }

    let error: Error | null = null;

    try {
      await next();
    } catch (err) {
      error = err as Error;
      logData.error = err instanceof Error ? err.message : String(err);
      throw err; // 重新抛出错误让错误处理中间件处理
    } finally {
      // 记录结束时间和响应信息
      const endTime = Date.now();
      logData.endTime = endTime;
      logData.duration = endTime - startTime;
      logData.statusCode = c.res.status;
      
      // 尝试获取响应大小
      const contentLength = c.res.headers.get("content-length");
      if (contentLength) {
        logData.responseSize = parseInt(contentLength, 10);
      }

      // 记录完整日志
      await logRequest(c, logData);
    }
  };
}

/**
 * 记录请求日志的函数
 * 根据环境选择不同的日志记录方式
 */
async function logRequest(c: Context<{ Bindings: Env }>, logData: RequestLog) {
  const isError = logData.statusCode && logData.statusCode >= 400;
  const isDevelopment = c.env.ENVIRONMENT === "development";
  const isSlowRequest = logData.duration && logData.duration > 1000; // 超过1秒的请求

  // 控制台日志
  if (isDevelopment || isError || isSlowRequest) {
    const statusEmoji = getStatusEmoji(logData.statusCode || 0);
    const durationColor = getDurationColor(logData.duration || 0);
    
    console.log(
      `${statusEmoji} ${logData.method} ${logData.url} ` +
      `${logData.statusCode} ${durationColor}${logData.duration}ms${'\x1b[0m'} ` +
      `[${logData.requestId}]` +
      (logData.error ? ` ❌ ${logData.error}` : "")
    );
  }

  // 生产环境下记录到 KV 或其他存储
  if (c.env.ENVIRONMENT === "production") {
    try {
      // 可以选择记录到 KV、Analytics Engine 或其他日志服务
      // 这里只记录错误和慢请求到 KV
      if (isError || isSlowRequest) {
        const logKey = `log:${logData.requestId}:${logData.startTime}`;
        await c.env.KV.put(
          logKey, 
          JSON.stringify(logData),
          { expirationTtl: 7 * 24 * 60 * 60 } // 7天过期
        );
      }
    } catch (kvError) {
      console.error("Failed to write log to KV:", kvError);
    }
  }

  // 记录性能指标
  recordMetrics(c, logData);
}

/**
 * 根据状态码返回对应的 emoji
 */
function getStatusEmoji(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return "✅";
  if (statusCode >= 300 && statusCode < 400) return "🔄";
  if (statusCode >= 400 && statusCode < 500) return "⚠️";
  if (statusCode >= 500) return "❌";
  return "📝";
}

/**
 * 根据请求时长返回颜色代码
 */
function getDurationColor(duration: number): string {
  if (duration < 100) return "\x1b[32m"; // 绿色
  if (duration < 500) return "\x1b[33m"; // 黄色
  if (duration < 1000) return "\x1b[35m"; // 紫色
  return "\x1b[31m"; // 红色
}

/**
 * 记录性能指标
 * 可以集成到 Analytics Engine 或其他监控服务
 */
function recordMetrics(c: Context<{ Bindings: Env }>, logData: RequestLog) {
  // 这里可以发送指标到 Cloudflare Analytics Engine
  // 或其他监控服务如 DataDog、New Relic 等
  
  // 简单的内存统计（仅开发环境）
  if (c.env.ENVIRONMENT === "development") {
    const isSlowRequest = logData.duration && logData.duration > 500;
    const isErrorRequest = logData.statusCode && logData.statusCode >= 400;
    
    if (isSlowRequest) {
      console.warn(`🐌 Slow request detected: ${logData.duration}ms`);
    }
    
    if (isErrorRequest) {
      console.error(`💥 Error request: ${logData.statusCode} ${logData.error || ""}`);
    }
  }
}

/**
 * 获取请求统计信息的辅助函数
 */
export async function getRequestStats(c: Context<{ Bindings: Env }>, hours = 24) {
  if (c.env.ENVIRONMENT !== "production") {
    return { message: "Stats only available in production" };
  }

  try {
    // 从 KV 中获取最近的日志记录
    const list = await c.env.KV.list({ prefix: "log:" });
    const logs = await Promise.all(
      list.keys.slice(0, 100).map(async (key) => {
        const data = await c.env.KV.get(key.name);
        return data ? JSON.parse(data) : null;
      })
    );

    const validLogs = logs.filter(Boolean) as RequestLog[];
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const recentLogs = validLogs.filter(log => log.startTime > cutoff);

    return {
      totalRequests: recentLogs.length,
      averageDuration: recentLogs.reduce((sum, log) => sum + (log.duration || 0), 0) / recentLogs.length,
      errorRate: recentLogs.filter(log => log.statusCode && log.statusCode >= 400).length / recentLogs.length,
      slowRequests: recentLogs.filter(log => log.duration && log.duration > 1000).length,
    };
  } catch (error) {
    console.error("Failed to get request stats:", error);
    return { error: "Failed to get stats" };
  }
}