/// <reference types="@cloudflare/workers-types" />

// 扩展 Cloudflare Workers 类型，确保所有 Bindings 都有正确的类型定义
declare global {
  // 确保我们使用的是正确的 Cloudflare Workers 类型
  interface CloudflareWorkerKV extends KVNamespace {}
  interface CloudflareWorkerD1 extends D1Database {}
  interface CloudflareWorkerR2 extends R2Bucket {}
  interface CloudflareVectorizeIndex extends VectorizeIndex {}
  interface CloudflareDurableObjectNamespace extends DurableObjectNamespace {}
}

// Cloudflare Workers 环境绑定接口
export interface Env {
  // KV 命名空间
  SESSION_KV?: KVNamespace;
  
  // D1 数据库
  DB: D1Database;
  
  // R2 存储桶
  R2_BUCKET?: R2Bucket;
  
  // Vectorize 索引
  VECTORIZE?: VectorizeIndex;
  
  // Durable Objects
  DURABLE_OBJECTS?: DurableObjectNamespace;

  // Queue bindings
  QUEUE_EMBED?: Queue;
  
  // 环境变量
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AIHUBMIX_API_KEY?: string;
  WAHA_API_URL?: string;
  WAHA_API_KEY?: string;
}

// 导出空对象以使其成为模块
export {};
