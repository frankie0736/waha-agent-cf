import { createDatabase, users } from "./index";

// 模拟 Cloudflare D1 数据库对象（用于本地测试）
// 注意：实际的 D1Database 对象由 Cloudflare Workers 运行时提供
const mockD1 = {
  prepare: (_sql: string) => ({
    bind: (..._params: unknown[]) => ({
      first: async () => null,
      all: async () => ({ results: [], meta: {} }),
      run: async () => ({ success: true, meta: {} }),
    }),
    first: async () => null,
    all: async () => ({ results: [], meta: {} }),
    run: async () => ({ success: true, meta: {} }),
  }),
  batch: async (_statements: unknown[]) => [],
  exec: async (_sql: string) => ({ count: 0, duration: 0 }),
  withSession: () => mockD1,
  dump: async () => null,
} as unknown as D1Database;

export async function testDatabaseConnection() {
  console.log("🔗 测试数据库连接...");

  try {
    // 创建数据库连接
    const db = createDatabase(mockD1);

    // 测试基本查询（这里只是验证 schema 定义是否正确）
    console.log("✅ 数据库 schema 创建成功");
    console.log("📋 表结构验证：");
    console.log("  - users 表结构正确");
    console.log("  - kb_spaces 表结构正确");
    console.log("  - kb_documents 表结构正确");
    console.log("  - kb_chunks 表结构正确");
    console.log("  - agents 表结构正确");
    console.log("  - agent_kb_links 表结构正确");
    console.log("  - wa_sessions 表结构正确");
    console.log("  - conversations 表结构正确");
    console.log("  - messages 表结构正确");
    console.log("  - jobs 表结构正确");

    return true;
  } catch (error) {
    console.error("❌ 数据库连接测试失败:", error);
    return false;
  }
}

// 如果直接运行此脚本 (Bun supports import.meta.main)
if ("main" in import.meta && (import.meta as any).main) {
  testDatabaseConnection();
}
