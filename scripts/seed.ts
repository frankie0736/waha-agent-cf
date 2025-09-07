#!/usr/bin/env bun
import { seedDatabase } from "../database/seed";

console.log("🌱 开始数据库种子数据插入...");
console.log("⚠️  注意：这是一个演示脚本，在生产环境中种子数据应通过 Cloudflare Workers 环境运行");

// 模拟 D1Database 接口用于本地开发
const mockD1 = {
  prepare: (sql: string) => {
    console.log(`📝 SQL: ${sql}`);
    return {
      bind: (...params: unknown[]) => {
        console.log(`🔗 参数:`, params);
        return {
          first: async () => {
            console.log("✅ 模拟查询执行 - first()");
            return null;
          },
          all: async () => {
            console.log("✅ 模拟查询执行 - all()");
            return { results: [], meta: {} };
          },
          run: async () => {
            console.log("✅ 模拟查询执行 - run()");
            return { success: true, meta: {} };
          },
        };
      },
      first: async () => {
        console.log("✅ 模拟查询执行 - first()");
        return null;
      },
      all: async () => {
        console.log("✅ 模拟查询执行 - all()");
        return { results: [], meta: {} };
      },
      run: async () => {
        console.log("✅ 模拟查询执行 - run()");
        return { success: true, meta: {} };
      },
    };
  },
  batch: async (statements: unknown[]) => {
    console.log(`🔄 批量执行 ${statements.length} 条语句`);
    return [];
  },
  exec: async (sql: string) => {
    console.log(`🏃 执行 SQL: ${sql}`);
    return { count: 0, duration: 0 };
  },
  withSession: () => mockD1,
  dump: async () => null,
} as unknown as D1Database;

// 导入数据库创建函数
const { createDatabase } = await import("../database/index");

async function runSeed() {
  try {
    const db = createDatabase(mockD1);
    await seedDatabase(db);
    console.log("\n🎉 种子数据脚本执行完成！");
  } catch (error) {
    console.error("\n💥 种子数据脚本执行失败:", error);
    process.exit(1);
  }
}

runSeed();
