# WA-Agent 开发文档
# 多租户 WhatsApp 智能客服系统

更新时间：2025-09-07

---

## 目录

1. [系统架构设计](#1-系统架构设计)
2. [技术栈详细说明](#2-技术栈详细说明)
3. [数据库设计](#3-数据库设计)
4. [人工介入系统设计](#4-人工介入系统设计)
5. [消息处理流水线](#5-消息处理流水线)
6. [API 接口规范](#6-api-接口规范)
7. [第三方服务集成](#7-第三方服务集成)
8. [安全与加密](#8-安全与加密)
9. [测试与部署](#9-测试与部署)
10. [运维与监控](#10-运维与监控)

---

## 1. 系统架构设计（与 waha-agent@CF.md 保持一致）

### 1.1 整体架构

```
前端 (React + TanStack Router/Query)
    ↓ (Hono RPC)
API网关 (Cloudflare Workers + Hono + Better Auth)
    ↓
┌─────────────┬─────────────┬─────────────┐
│ 知识库模块   │ 智能体模块   │ 消息处理模块 │
└─────────────┴─────────────┴─────────────┘
    ↓
数据存储 (D1 + KV + R2 + Vectorize)
    ↓
Durable Objects (ChatSessionDO) + Queues
    ↓
外部服务 (WAHA API + AIHubMix API)
```

### 1.2 数据流设计

```
[WhatsApp 用户] 
    ↓ 消息
[WAHA API] 
    ↓ Webhook (签名验证)
[Worker 入口] 
    ↓ 幂等检查
[ChatSessionDO] ← (强顺序 + 2s合并窗 + 人工介入检查)
    ↓
[q_retrieve 队列] ← 向量搜索知识库
    ↓
[q_infer 队列] ← AIHubMix LLM调用
    ↓
[q_reply 队列] ← 人性化处理 + 发送
    ↓
[WAHA API] 
    ↓ 消息
[WhatsApp 用户]
```

### 1.2 核心模块设计

```typescript
interface ModuleDefinition {
  name: string;
  basePath: string;
  createModule: (app: Hono) => Hono;
}

// 核心模块列表
const modules = [
  'auth',           // 认证模块
  'admin',          // 管理员模块
  'knowledge-bases', // 知识库模块
  'document-chunks', // 文档切片模块
  'documents',      // 文档模块
  'agents',         // 智能体模块
  'bots',           // 机器人模块
  'webhooks',       // Webhook 处理
  'conversations',  // 对话管理
];
```

### 1.3 数据流设计

```
[WhatsApp 用户] 
    ↓ 消息
[WAHA API] 
    ↓ Webhook (签名验证)
[Worker 入口] 
    ↓ 幂等检查
[消息队列] 
    ↓
[ChatSessionDO] ← (强顺序 + 2s合并窗 + 人工介入检查)
    ↓
[检索队列 q_retrieve] ← 向量搜索知识库
    ↓
[推理队列 q_infer] ← AIHubMix LLM调用
    ↓
[回复队列 q_reply] ← 人性化处理 + 发送
    ↓
[WAHA API] 
    ↓ 消息
[WhatsApp 用户]
```

---

## 2. 技术栈详细说明

### 2.1 前端技术栈

```json
{
  "framework": "React 18 + TypeScript",
  "router": "@tanstack/react-router",
  "state": "@tanstack/react-query",
  "ui": "Radix UI + Tailwind CSS",
  "build": "Vite",
  "validation": "Zod",
  "http": "Hono RPC Client"
}
```

### 2.2 后端技术栈

```json
{
  "runtime": "Cloudflare Workers",
  "framework": "Hono",
  "auth": "Better Auth (Google OAuth)",
  "database": "Cloudflare D1 (SQLite)",
  "orm": "Drizzle ORM + Drizzle-Zod",
  "validation": "Zod",
  "storage": "Cloudflare R2",
  "cache": "Cloudflare KV",
  "vectors": "Cloudflare Vectorize",
  "realtime": "Durable Objects",
  "queues": "Cloudflare Queues"
}
```

---

## 3. 数据库设计

### 3.1 用户与认证

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_id TEXT UNIQUE,
  verified INTEGER DEFAULT 0,
  aihubmix_key TEXT,
  kb_limit INTEGER, 
  agent_limit INTEGER, 
  wa_limit INTEGER,
  created_at BIGINT, 
  last_active_at BIGINT
);

-- 知识库表
CREATE TABLE kb_spaces (
  id TEXT PRIMARY KEY, 
  user_id TEXT, 
  name TEXT, 
  created_at BIGINT
);

-- 文档表
CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY, 
  kb_id TEXT, 
  filename TEXT, 
  filetype TEXT, 
  r2_key TEXT, 
  status TEXT, 
  created_at BIGINT
);

-- 文档切片表
CREATE TABLE kb_chunks (
  id TEXT PRIMARY KEY, 
  kb_id TEXT, 
  doc_id TEXT, 
  chunk_index INTEGER, 
  text TEXT, 
  vector_id TEXT, 
  created_at BIGINT
);

-- 智能体表
CREATE TABLE agents (
  id TEXT PRIMARY KEY, 
  user_id TEXT, 
  name TEXT, 
  prompt_system TEXT, 
  model TEXT, 
  temperature REAL, 
  created_at BIGINT
);
```

### 3.2 WhatsApp 相关表

```sql
-- WhatsApp Sessions 表 (对应 WAHA 会话)
CREATE TABLE wa_sessions (
  id TEXT PRIMARY KEY,
  wa_account_id TEXT NOT NULL,
  qr_code TEXT,
  status TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  auto_reply_state INTEGER DEFAULT 1  -- 1=开启, 0=暂停 (session级控制)
);

-- 对话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  wa_account_id TEXT NOT NULL,
  chat_key TEXT NOT NULL,
  last_turn INTEGER DEFAULT 0,
  updated_at BIGINT,
  auto_reply_state INTEGER DEFAULT 1,  -- 1=开启, 0=暂停 (conversation级控制)
  UNIQUE (chat_key)
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY, 
  chat_key TEXT, 
  turn INTEGER, 
  role TEXT,  -- 'user'|'assistant'|'human'
  text TEXT, 
  status TEXT, 
  ts BIGINT
);

-- 任务表
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, 
  chat_key TEXT, 
  turn INTEGER, 
  stage TEXT, 
  status TEXT,  -- 包含 'suppressed' 状态
  created_at BIGINT, 
  updated_at BIGINT
);
```

---

## 4. 人工介入系统设计

### 4.1 双层控制机制

**优先级**: Session 级 > Conversation 级

**Session 级控制**（后台管理员操作）：
- 控制整个 WhatsApp 账号的自动回复
- 暂停后，该账号下所有对话都停止自动回复
- 仅记录消息，不进入 AI 处理流程

**Conversation 级控制**（用户标点符号触发）：
- 控制特定聊天的自动回复
- `,` (逗号) → 开始人工介入（暂停该聊天自动回复）
- `.` (句号) → 结束人工介入（恢复该聊天自动回复）

### 4.2 实现代码

```typescript
// 人工介入控制器
export class ManualInterventionController {
  
  // Session 级控制
  async pauseSession(sessionId: string): Promise<void> {
    await this.db.update(wa_sessions)
      .set({ auto_reply_state: 0 })
      .where(eq(wa_sessions.id, sessionId));
  }

  async resumeSession(sessionId: string): Promise<void> {
    await this.db.update(wa_sessions)
      .set({ auto_reply_state: 1 })
      .where(eq(wa_sessions.id, sessionId));
  }

  // Conversation 级控制（标点符号触发）
  async handlePunctuationControl(chatKey: string, message: string): Promise<'paused' | 'resumed' | 'no_change'> {
    const trimmed = message.trim();
    
    if (trimmed.endsWith(',')) {
      // 开始人工介入
      await this.db.update(conversations)
        .set({ auto_reply_state: 0 })
        .where(eq(conversations.chat_key, chatKey));
      return 'paused';
    }
    
    if (trimmed.endsWith('.')) {
      // 结束人工介入
      await this.db.update(conversations)
        .set({ auto_reply_state: 1 })
        .where(eq(conversations.chat_key, chatKey));
      return 'resumed';
    }
    
    return 'no_change';
  }

  // 检查是否应该自动回复
  async shouldAutoReply(chatKey: string): Promise<boolean> {
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.chat_key, chatKey)
    });
    
    const session = await this.db.query.wa_sessions.findFirst({
      where: eq(wa_sessions.wa_account_id, conversation.wa_account_id)
    });
    
    // Session 级优先级更高
    if (session?.auto_reply_state === 0) return false;
    
    // Conversation 级控制
    return conversation?.auto_reply_state === 1;
  }
}

// AI 安全剪裁（防止误触发）
export function safeTrim(text: string): string {
  // 去掉结尾单个逗号或句号，防止 AI 误触发控制
  if (text.endsWith(',') || text.endsWith('.')) {
    return text.slice(0, -1);
  }
  return text;
}
```

---

## 5. 消息处理流水线

### 5.1 消息合并窗口（Durable Object）

```typescript
export class ChatSessionDO extends DurableObject {
  private messageBuffer: Array<{ text: string; timestamp: number }> = [];
  private mergeTimer?: number;
  private interventionController = new ManualInterventionController(this.env);
  
  async handleMessage(request: Request) {
    const { chatKey, message } = await request.json();
    
    // 1. 检查标点控制（立即生效，不参与合并）
    const punctuationResult = await this.interventionController
      .handlePunctuationControl(chatKey, message);
      
    if (punctuationResult !== 'no_change') {
      return Response.json({ result: punctuationResult });
    }
    
    // 2. 检查是否应该自动回复
    if (!await this.interventionController.shouldAutoReply(chatKey)) {
      // 仅记录消息，标记为已抑制
      await this.logMessage(chatKey, message, 'suppressed');
      return Response.json({ result: 'suppressed' });
    }
    
    // 3. 加入合并缓冲区
    this.messageBuffer.push({ text: message, timestamp: Date.now() });
    
    // 4. 设置或重置 2s 合并窗口
    if (this.mergeTimer) {
      clearTimeout(this.mergeTimer);
    }
    
    this.mergeTimer = setTimeout(async () => {
      await this.flushMessages(chatKey);
    }, 2000);
    
    return Response.json({ result: 'buffered' });
  }
  
  private async flushMessages(chatKey: string) {
    if (this.messageBuffer.length === 0) return;
    
    const mergedText = this.messageBuffer.map(m => m.text).join(' ');
    this.messageBuffer = [];
    
    // 进入处理流水线
    await this.env.QUEUES.send('retrieve', { 
      chatKey, 
      mergedText, 
      timestamp: Date.now() 
    });
  }
}
```

### 5.2 队列处理流程

```typescript
// q_retrieve - 知识库检索
export async function handleRetrieveQueue(batch: MessageBatch<RetrieveMessage>) {
  for (const message of batch.messages) {
    const { chatKey, mergedText } = message.body;
    
    // 向量检索
    const relevantChunks = await vectorStore.search({
      query: mergedText,
      topK: 8,
      knowledgeBaseIds: await getAgentKnowledgeBases(chatKey)
    });
    
    // 发送到推理队列
    await env.QUEUES.send('infer', {
      chatKey,
      userMessage: mergedText,
      context: relevantChunks,
      timestamp: Date.now()
    });
  }
}

// q_infer - AI 推理
export async function handleInferQueue(batch: MessageBatch<InferMessage>) {
  for (const message of batch.messages) {
    const { chatKey, userMessage, context } = message.body;
    
    // 获取智能体配置
    const agent = await getAgentByChat(chatKey);
    
    // 调用 AIHubMix
    const response = await aiClient.chat([
      { role: 'system', content: agent.systemPrompt },
      ...await getChatHistory(chatKey),
      { role: 'user', content: userMessage }
    ], agent.model, {
      temperature: agent.temperature,
      max_tokens: agent.maxTokens
    });
    
    // 发送到回复队列
    await env.QUEUES.send('reply', {
      chatKey,
      aiResponse: response.choices[0].message.content,
      timestamp: Date.now()
    });
  }
}

// q_reply - 人性化回复
export async function handleReplyQueue(batch: MessageBatch<ReplyMessage>) {
  for (const message of batch.messages) {
    const { chatKey, aiResponse } = message.body;
    
    // 队列兜底检查：再次确认是否应该自动回复
    if (!await interventionController.shouldAutoReply(chatKey)) {
      await markJobSuppressed(message.id);
      continue;
    }
    
    // AI 安全剪裁
    const safeResponse = safeTrim(aiResponse);
    
    // 人性化处理：分段、延迟、输入状态
    const segments = splitMessage(safeResponse);
    
    for (let i = 0; i < segments.length; i++) {
      // 发送输入状态
      await wahaClient.sendTyping(chatKey, 2000);
      
      // 延迟
      await sleep(randomDelay(2000, 5000));
      
      // 发送消息
      await wahaClient.sendMessage(chatKey, segments[i]);
      
      // 段间延迟
      if (i < segments.length - 1) {
        await sleep(1000);
      }
    }
  }
}
```

---

## 6. API 接口规范

### 6.1 人工介入接口

```typescript
// Session 级控制
app.post('/api/wa/session/pause', zValidator('json', z.object({
  waSessionId: z.string()
})), async (c) => {
  const { waSessionId } = c.req.valid('json');
  await interventionController.pauseSession(waSessionId);
  return c.json({ success: true });
});

app.post('/api/wa/session/resume', zValidator('json', z.object({
  waSessionId: z.string()
})), async (c) => {
  const { waSessionId } = c.req.valid('json');
  await interventionController.resumeSession(waSessionId);
  return c.json({ success: true });
});

// 状态查询
app.get('/api/wa/session/status', async (c) => {
  const sessionId = c.req.query('id');
  const session = await getSession(sessionId);
  
  return c.json({
    id: session.id,
    status: session.status,
    auto_reply_state: session.auto_reply_state,
    created_at: session.created_at,
    updated_at: session.updated_at
  });
});

app.get('/api/chat/status', async (c) => {
  const chatKey = c.req.query('chatKey');
  const conversation = await getConversation(chatKey);
  
  return c.json({
    chat_key: conversation.chat_key,
    auto_reply_state: conversation.auto_reply_state,
    last_turn: conversation.last_turn,
    updated_at: conversation.updated_at
  });
});
```

### 6.2 Webhook 处理

```typescript
// WAHA Webhook 处理
app.post('/api/webhooks/waha/:botId', async (c) => {
  const botId = c.req.param('botId');
  const signature = c.req.header('X-WAHA-Signature');
  const timestamp = c.req.header('X-Signature-Timestamp');
  const body = await c.req.text();
  
  // 1. 签名验证
  if (!await verifyWebhookSignature(botId, body, signature, timestamp)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  // 2. 幂等性检查
  const idempotencyKey = `${botId}:${JSON.parse(body).data.message?.id}`;
  if (await c.env.KV.get(`waha:processed:${idempotencyKey}`)) {
    return c.json({ message: 'Already processed' });
  }
  
  // 3. 解析消息
  const webhook = JSON.parse(body);
  if (webhook.event === 'message' && webhook.data.message) {
    const message = webhook.data.message;
    const chatKey = `${botId}:${message.from}`;
    
    // 4. 发送到 Durable Object 处理
    const doId = c.env.CHAT_SESSIONS.idFromString(chatKey);
    const doStub = c.env.CHAT_SESSIONS.get(doId);
    
    await doStub.fetch('http://do/message', {
      method: 'POST',
      body: JSON.stringify({
        chatKey,
        message: message.body
      })
    });
    
    // 5. 标记为已处理
    await c.env.KV.put(`waha:processed:${idempotencyKey}`, '1', {
      expirationTtl: 86400 // 24小时
    });
  }
  
  return c.json({ success: true });
});
```

---

## 7. 第三方服务集成

### 7.1 WAHA API 客户端

```typescript
export class WAHAClient {
  private apiUrl: string;
  private apiKey: string;
  
  constructor(apiUrl: string, encryptedApiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = decrypt(encryptedApiKey);
  }
  
  // 创建会话
  async createSession(sessionId: string, webhookUrl: string): Promise<CreateSessionResult> {
    const response = await fetch(`${this.apiUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: sessionId,
        config: {
          webhook: {
            url: webhookUrl,
            events: ['message', 'session.status'],
            hmac: {
              key: generateWebhookSecret()
            }
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`WAHA API Error: ${response.statusText}`);
    }
    
    // 获取二维码
    const qrResponse = await fetch(`${this.apiUrl}/api/${sessionId}/auth/qr`, {
      headers: { 'X-Api-Key': this.apiKey }
    });
    
    const qrData = await qrResponse.json();
    
    return {
      sessionId,
      qrCode: qrData.qr,
      webhookUrl,
      status: 'connecting'
    };
  }
  
  // 发送消息
  async sendMessage(sessionId: string, chatId: string, text: string): Promise<void> {
    await fetch(`${this.apiUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: sessionId,
        chatId,
        text
      })
    });
  }
  
  // 发送输入状态
  async sendTyping(sessionId: string, chatId: string, duration: number): Promise<void> {
    await fetch(`${this.apiUrl}/api/sendTyping`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: sessionId,
        chatId,
        duration
      })
    });
  }
}
```

### 7.2 AIHubMix 客户端

```typescript
export class AIHubMixClient {
  private apiKey: string;
  private endpoint: string;
  
  constructor(apiKey: string, endpoint = 'https://api.aihubmix.com/v1') {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }
  
  async chat(messages: ChatMessage[], model: string, options: ChatOptions = {}) {
    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
        ...options
      })
    });
    
    if (!response.ok) {
      throw new Error(`AIHubMix API Error: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async embeddings(texts: string[], model = 'text-embedding-3-small') {
    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: texts
      })
    });
    
    return response.json();
  }
}
```

---

## 8. 安全与加密

### 8.1 数据加密

```typescript
// 使用 WebCrypto API 进行 AES-GCM 加密
export async function encrypt(text: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // 从密钥派生
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('wa-agent-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  
  // 格式: v1:base64(iv):base64(ciphertext)
  const ivB64 = btoa(String.fromCharCode(...iv));
  const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  
  return `v1:${ivB64}:${encryptedB64}`;
}

export async function decrypt(encryptedText: string, key: string): Promise<string> {
  const [version, ivB64, encryptedB64] = encryptedText.split(':');
  
  if (version !== 'v1') {
    throw new Error('Unsupported encryption version');
  }
  
  // 解码
  const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)));
  const encrypted = new Uint8Array(atob(encryptedB64).split('').map(c => c.charCodeAt(0)));
  
  // 重新派生密钥（与加密时相同）
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('wa-agent-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}
```

### 8.2 Webhook 签名验证

```typescript
export async function verifyWebhookSignature(
  botId: string,
  body: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  // 1. 时间窗口检查（±300 秒）
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp);
  
  if (Math.abs(now - ts) > 300) {
    return false;
  }
  
  // 2. 重放攻击防护
  const replayKey = `waha:replay:${signature}`;
  if (await kv.get(replayKey)) {
    return false;
  }
  
  // 3. 获取 webhook 密钥
  const bot = await getBotById(botId);
  const webhookSecret = bot.waha_webhook_secret;
  
  // 4. 计算期望签名
  const payload = `${timestamp}\n${body}`;
  const expectedSignature = await hmacSha256(webhookSecret, payload);
  
  // 5. 签名比较
  const isValid = signature === expectedSignature;
  
  // 6. 如果验证通过，标记签名防重放
  if (isValid) {
    await kv.put(replayKey, '1', { expirationTtl: 300 });
  }
  
  return isValid;
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

---

## 9. 测试与部署

### 9.1 测试策略

```typescript
// 人工介入功能测试
describe('人工介入系统', () => {
  let controller: ManualInterventionController;
  
  beforeEach(async () => {
    controller = new ManualInterventionController(testDB);
    await setupTestData();
  });
  
  it('应该正确处理标点符号控制', async () => {
    // 测试逗号暂停
    const result1 = await controller.handlePunctuationControl(
      'test-chat', 
      '我需要人工客服，'
    );
    expect(result1).toBe('paused');
    
    // 验证状态
    const shouldReply1 = await controller.shouldAutoReply('test-chat');
    expect(shouldReply1).toBe(false);
    
    // 测试句号恢复
    const result2 = await controller.handlePunctuationControl(
      'test-chat', 
      '问题解决了。'
    );
    expect(result2).toBe('resumed');
    
    // 验证状态
    const shouldReply2 = await controller.shouldAutoReply('test-chat');
    expect(shouldReply2).toBe(true);
  });
  
  it('应该正确处理优先级', async () => {
    // Session 级暂停
    await controller.pauseSession('test-session');
    
    // Conversation 级恢复
    await controller.handlePunctuationControl('test-chat', '问题解决了。');
    
    // Session 级应该优先
    const shouldReply = await controller.shouldAutoReply('test-chat');
    expect(shouldReply).toBe(false);
  });
});

// 消息合并测试
describe('消息合并窗口', () => {
  it('应该正确合并短消息', async () => {
    const chatDO = new ChatSessionDO(mockState, mockEnv);
    
    // 发送多条短消息
    await chatDO.fetch(createMessage('test-chat', '你好'));
    await chatDO.fetch(createMessage('test-chat', '我想咨询'));
    await chatDO.fetch(createMessage('test-chat', '产品价格'));
    
    // 等待合并窗口
    await sleep(2100);
    
    // 验证合并结果
    const processedMessage = await getLastProcessedMessage('test-chat');
    expect(processedMessage.text).toBe('你好 我想咨询 产品价格');
  });
});
```

### 9.2 部署配置

```bash
# 环境变量设置
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put ADMIN_EMAILS

# 数据库迁移
bun run db:generate
bun run db:push:remote

# 部署
bun run build
bun run deploy
```

---

## 10. 运维与监控

### 10.1 关键指标

```typescript
interface SystemMetrics {
  // 性能指标
  webhook_p95_latency: number;     // < 50ms
  message_merge_window: number;    // 2s
  end_to_end_response: number;     // < 3s
  
  // 人工介入指标
  session_pause_rate: number;      // Session 暂停频率
  conversation_pause_rate: number; // Conversation 暂停频率
  punctuation_trigger_rate: number; // 标点触发频率
  
  // 业务指标
  message_throughput: number;      // 消息吞吐量
  ai_response_accuracy: number;    // AI 回复准确率
  user_satisfaction: number;       // 用户满意度
  
  // 错误指标
  webhook_signature_failures: number; // Webhook 签名失败
  queue_processing_errors: number;     // 队列处理错误
  durable_object_errors: number;       // DO 错误
}
```

### 10.2 监控实现

```typescript
// 指标收集中间件
export const metricsMiddleware = async (c: Context, next: Next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  
  c.set('requestId', requestId);
  c.set('startTime', start);
  
  try {
    await next();
  } finally {
    const duration = Date.now() - start;
    
    // 记录指标
    await recordMetric({
      type: 'api_request',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      userId: c.get('user')?.id,
      requestId
    });
  }
};

// 人工介入监控
export async function trackInterventionMetrics(
  type: 'session_pause' | 'session_resume' | 'conversation_pause' | 'conversation_resume',
  metadata: Record<string, any>
) {
  await recordMetric({
    type: 'manual_intervention',
    action: type,
    timestamp: Date.now(),
    ...metadata
  });
}

// 健康检查端点
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: 'ok',
      kv: 'ok',
      queues: 'ok',
      durable_objects: 'ok'
    }
  });
});
```

---

## 总结

本开发文档基于 `docs/waha-agent@CF.md` 的设计规范，提供了完整的技术实现指南，包括：

1. **双层人工介入控制机制**：Session 级（管理员）+ Conversation 级（标点符号）
2. **智能消息合并**：2s 窗口，通过 Durable Objects 实现强顺序处理
3. **完整的队列处理流水线**：retrieve → infer → reply，支持人工介入检查
4. **安全的第三方集成**：WAHA API + AIHubMix，包含签名验证和数据加密
5. **可扩展的架构设计**：基于 Cloudflare 全家桶，支持多租户隔离

开发团队可以按照此文档进行模块化开发，确保系统的安全性、可靠性和可扩展性。