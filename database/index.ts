import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(d1: D1Database) {
  return drizzle(d1, { schema });
}

// 导出所有 schema 以便使用
export * from "./schema/index";

// 导出常用工具函数
export { eq, and, or, like, desc, asc, count, sql } from "drizzle-orm";
