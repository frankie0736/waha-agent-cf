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

// 导出空对象以使其成为模块
export {};
