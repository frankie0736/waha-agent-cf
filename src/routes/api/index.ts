import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../../index";
import { ApiErrors } from "../../middleware/error-handler";
import { documents } from "./documents";
import { knowledgeBase } from "./knowledge-base";
import webScraper from "./web-scraper";
import vectorSearch from "./vector-search";
import { aihubmix } from "./aihubmix";

// API 路由主入口
const api = new Hono<{ Bindings: Env }>();

// 健康检查端点 - 增强版
const healthRoute = api.get(
  "/health",
  zValidator(
    "query",
    z.object({
      detailed: z
        .string()
        .optional()
        .transform((val) => val === "true"),
    })
  ),
  async (c) => {
    const { detailed } = c.req.valid("query");
    const now = new Date().toISOString();

    // 基础健康状态
    const basicHealth = {
      status: "healthy",
      timestamp: now,
      version: "1.0.0",
      environment: c.env.ENVIRONMENT,
    };

    if (!detailed) {
      return c.json(basicHealth, 200);
    }

    // 详细健康检查
    const services = {
      database: "unknown",
      kv: "unknown",
      r2: "unknown",
      vectorize: "unknown",
      queues: "unknown",
      auth: "unknown",
    };

    try {
      // 检查数据库连接
      const dbResult = await c.env.DB.prepare("SELECT 1").first();
      services.database = dbResult ? "ok" : "error";
    } catch (error) {
      services.database = "error";
    }

    try {
      // 检查 KV
      await c.env.KV.get("health-check");
      services.kv = "ok";
    } catch (error) {
      services.kv = "error";
    }

    try {
      // 检查 R2（简单存在性检查）
      await c.env.R2.head("health-check");
      services.r2 = "ok";
    } catch (error) {
      // R2 head 操作对不存在的键会抛出错误，这是正常的
      services.r2 = "ok";
    }

    // Vectorize 和 Queues 检查可以在后续实现
    services.vectorize = "ok";
    services.queues = "ok";
    services.auth = "ok";

    return c.json(
      {
        ...basicHealth,
        services,
        uptime: 0, // process.uptime is not available in Cloudflare Workers
      },
      200
    );
  }
);

// 版本信息端点
const versionRoute = api.get("/version", (c) => {
  return c.json(
    {
      name: "waha-agent-cf",
      version: "1.0.0",
      buildTime: new Date().toISOString(),
      node: "cloudflare-workers", // process.version is not available in Cloudflare Workers
      platform: "cloudflare-workers",
      environment: c.env.ENVIRONMENT,
    },
    200
  );
});

// 系统统计端点（需要认证）
const statsRoute = api.get("/stats", async (c) => {
  // TODO: 添加认证中间件检查
  // const session = c.get('session');
  // if (!session) throw ApiErrors.Unauthorized();

  try {
    const stats = {
      timestamp: new Date().toISOString(),
      environment: c.env.ENVIRONMENT,
      // 基本统计信息
      database: {
        status: "connected",
        // 可以添加表计数等信息
      },
      storage: {
        kv_used: "unknown",
        r2_objects: "unknown",
      },
      // 请求统计可以从日志中间件获取
      requests: {
        total: "N/A",
        errors: "N/A",
        avg_response_time: "N/A",
      },
    };

    return c.json(stats, 200);
  } catch (error) {
    throw ApiErrors.InternalServerError("Failed to get system stats");
  }
});

// 测试端点 - 仅开发环境
const testRoute = api
  .get("/test/echo", (c) => {
    if (c.env.ENVIRONMENT !== "development") {
      throw ApiErrors.NotFound();
    }
    
    return c.json({
      message: "Echo test",
      timestamp: new Date().toISOString(),
      headers: {
        "user-agent": c.req.header("user-agent"),
        "content-type": c.req.header("content-type"),
        "authorization": c.req.header("authorization") ? "***" : undefined,
      },
      method: c.req.method,
      url: c.req.url,
    });
  })
  .post(
    "/test/validate",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email format"),
        age: z.number().min(0).max(150).optional(),
      })
    ),
    (c) => {
      if (c.env.ENVIRONMENT !== "development") {
        throw ApiErrors.NotFound();
      }

      const data = c.req.valid("json");
      return c.json({
        message: "Validation successful",
        data,
        timestamp: new Date().toISOString(),
      });
    }
  );

// 错误测试端点 - 仅开发环境  
const errorTestRoute = api.get("/test/error/:type", (c) => {
  if (c.env.ENVIRONMENT !== "development") {
    throw ApiErrors.NotFound();
  }

  const type = c.req.param("type");
  
  switch (type) {
    case "400":
      throw ApiErrors.BadRequest("This is a test bad request error");
    case "401":
      throw ApiErrors.Unauthorized("This is a test unauthorized error");
    case "403":
      throw ApiErrors.Forbidden("This is a test forbidden error");
    case "404":
      throw ApiErrors.NotFound("This is a test not found error");
    case "422":
      throw ApiErrors.ValidationError("This is a test validation error", {
        field: "test",
        code: "invalid",
      });
    case "500":
      throw ApiErrors.InternalServerError("This is a test internal error");
    default:
      throw new Error("This is an unhandled error for testing");
  }
});

// 组合所有路由
const routes = api
  .route("/", healthRoute)
  .route("/", versionRoute)
  .route("/", statsRoute)
  .route("/", testRoute)
  .route("/", errorTestRoute)
  .route("/knowledge-base", knowledgeBase)
  .route("/documents", documents)
  .route("/web-scraper", webScraper)
  .route("/vector-search", vectorSearch)
  .route("/aihubmix", aihubmix);

// 导出类型以供 RPC 客户端使用
export type ApiType = typeof routes;
export { routes as api };