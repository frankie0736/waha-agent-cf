import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../database/schema/index";
import type { Env } from "../index";

// Better Auth 配置函数，支持 CLI 和运行时场景
function createAuth(env?: Env, cf?: IncomingRequestCfProperties) {
  // 运行时使用实际 DB，CLI 时使用空对象
  const db = env ? drizzle(env.DB, { schema, logger: true }) : ({} as any);

  return betterAuth({
    // 数据库配置
    database: env ? drizzleAdapter(db, {
      provider: "sqlite",
      usePlural: true,
      debugLogs: true,
    }) : drizzleAdapter({} as any, {
      provider: "sqlite", 
      usePlural: true,
      debugLogs: true,
    }),
    
    // 基础认证配置
    emailAndPassword: {
      enabled: true,
    },
    
    // 社交登录配置
    socialProviders: {
      google: {
        clientId: env?.GOOGLE_CLIENT_ID || "",
        clientSecret: env?.GOOGLE_CLIENT_SECRET || "",
      },
    },
    
    // 速率限制
    rateLimit: {
      enabled: true,
      window: 60, // 60秒时间窗口
      max: 100, // 最大100个请求
    },
    
    // 高级配置
    advanced: {
      generateId: () => {
        // 生成自定义ID格式
        return `waha_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      },
    },
  });
}

// 导出给 CLI schema 生成使用
export const auth = createAuth();

// 导出给运行时使用
export { createAuth };

// 类型导出
export type Auth = ReturnType<typeof createAuth>;