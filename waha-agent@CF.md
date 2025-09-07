# WhatsApp 智能客服系统 MVP 设计文档

更新时间：2025-09-07

---

## 0. 需求说明

本项目要实现一个 **WhatsApp 智能客服系统**，让企业或个人用户可以快速搭建属于自己的智能机器人，帮助他们自动回复客户消息，减少人工工作量。  

主要需求如下：  

1. **用户注册与登录**  
   - 用户用 Google 账号一键登录。  
   - 超级管理员可审核用户、分配配额（最多几个知识库、几个机器人、几个 WhatsApp 账号）。  

2. **知识库管理**  
   - 用户上传文档（TXT、PDF、Word、Excel、PPT、Markdown），或输入网址 / 网站地图，系统自动读取内容。  
   - 系统会自动把内容切片、转成向量，存入知识库，供机器人检索。  

3. **智能体（机器人）管理**  
   - 用户可以创建多个机器人，并给它们绑定不同的知识库。  
   - 每个机器人可以设置提示词（角色、语气）、选择大模型（通过用户自己的 aihubmix API Key）。  

4. **WhatsApp 接入**  
   - 用户填入自己的 waha API 信息，系统帮他创建会话，并展示登录二维码。  
   - 扫码后账号上线，系统就能自动收发消息。  

5. **消息处理**  
   - 收到客户消息 → 系统合并短消息 → 检索知识库 → 调用大模型生成回答 → 自动回复。  
   - 回复要拟人化，结合聊天上下文。  
   - 支持人工介入：  
     - 后台有一个账号级别的“暂停/恢复自动回复”开关。  
     - 在聊天中，用户自己发消息时可用标点符号来临时暂停/恢复该对话的自动回复。  

6. **后台管理**  
   - 用户可以看到自己的知识库、机器人、WhatsApp 账号的状态。  
   - 超级管理员能看到整体统计：用户总数、消息总数、知识库使用情况。  

**一句话总结**：  
这个系统让用户通过扫码绑定自己的 WhatsApp 账号，再上传资料、创建机器人，就能让 AI 自动回答客户的问题，还能随时手动暂停或介入。  

---

## 1. 系统目标
- 为多用户提供可自助接入的 WhatsApp 智能客服平台。
- 基于 **Cloudflare 全家桶**：Workers / Durable Objects (DO) / D1 / KV / Queues / Vectorize / Pages。
- 大模型统一走 **aihubmix**（用户自行填写 API Key）。
- 回复需 **拟人化**、结合上下文；支持 **人工介入**（后台一键暂停账号；按“标点协议”做会话级静默控制）。

---

## 2. 认证与角色
- **登录**：Google 一键登录（Better Auth）。
- **角色**：
  - **超级管理员**：审核用户 `verified`，配置配额（知识库数 / 智能体数 / WhatsApp 账号数），查看全局数据统计。  
  - **普通用户**：绑定 aihubmix Key，管理知识库、智能体、WhatsApp 账号，使用人工介入能力。

---

## 3. 功能范围（MVP）

### 3.1 用户侧
1) **个人设置**  
   - Google 登录  
   - 绑定 aihubmix API Key（D1 加密存储）；查看配额使用情况

2) **知识库管理**  
   - 新建知识库（受配额）。  
   - 上传文件：**TXT / PDF / Word / Markdown / Excel / PPT**（原件存 R2）。  
   - 从 **URL** 或 **Sitemap URL** 批量抓取网页内容。  
   - 后端解析 → 自动切片 → aihubmix Embeddings → 写 **Vectorize**。

3) **智能体管理**  
   - 创建智能体，绑定 1–N 知识库；  
   - 配置系统提示词、模型、temperature、max tokens。

4) **WhatsApp 账号管理**  
   - 填写 waha API URL/Key → Worker 调 WAHA 创建 session，并配置 Webhook（`message` / `session.status`）。  
   - 前端 **短轮询** 会话状态（3–5s）：  
     - 若 `SCAN_QR_CODE` → 拉取 Base64 二维码展示；扫码后状态变 `WORKING` 即停止轮询。  
   - 展示账号在线/掉线状态；支持重启/删除。

5) **消息自动处理（含“智能合并短消息”）**  
   - WAHA Webhook → Worker 幂等入队。  
   - `ChatSessionDO` 负责 **强顺序** 与 **2s 合并窗**（将连续短消息合并为单次询问）。  
   - 合并文本进入流水线：`q_retrieve → q_infer → q_reply`。  
   - 回复需拟人化，结合上下文与检索片段。

6) **人工介入（两种方式，客户无感）**  
   - **session 级“暂停自动回复”开关（后台按钮）**：  
     - 关闭后，该 session 下所有会话停止机器人自动回复，仅记录来消息。  
     - 打开后，从新消息起恢复自动回复。  
   - **conversation 级"标点静默控制"**：  
     - 用户自己发送消息时使用标点命令：  
       - **`,`（半角逗号）** → 开始本会话人工介入（暂停自动回复）；  
       - **`.`（半角句号）** → 结束本会话人工介入（恢复自动回复）。  
     - 为避免 AI 误触发，AI 回复前需统一做末尾安全剪裁（见 §5.4）。

> **优先级**：session 开关高于 conversation 开关。

---

## 4. 技术架构

- **前端**：React + TanStack Router/Query，Hono RPC 调用后端；二维码与会话状态用短轮询（未来可换 SSE）。  
- **后端 API**：Workers + Hono + Hono RPC；Better Auth 做认证。  
- **Durable Objects**：  
  - `ChatSessionDO`（Key = `userId:waAccountId:whatsappChatId`）：  
    - 负责会话强顺序；  
    - 2s 合并窗（Alarms 实现）；  
    - 读取/缓存 session & conversation 的开关状态；  
    - 处理标点静默逻辑。  
- **存储**：  
  - **D1**：用户、知识库、智能体、账号、session、conversation、消息、任务。  
  - **KV**：幂等键、速率桶、缓存。  
  - **Vectorize**：知识库向量检索。  
  - **R2**：存储原始文件与网页快照。  
- **异步队列**：`q_ingest → q_embed → q_retrieve → q_infer → q_reply`。  
- **模型调用**：全部通过用户的 aihubmix Key。

---

## 5. 关键流程

### 5.1 账号接入与扫码
1. 用户后台 `POST /rpc/wa/session.create` → Worker 调 WAHA 创建 session。  
2. 前端轮询 `GET /rpc/wa/session.status` → 若状态 `SCAN_QR_CODE`，拉取二维码展示。  
3. 用户扫码 → 状态更新为 `WORKING`，前端停止轮询。

### 5.2 短消息合并
- DO 收到首条消息时设定 `Alarm(now + 2s)`；  
- 窗口内若收到更多消息，延后 Alarm；  
- 出窗时将缓存的消息合并为一次输入。

### 5.3 人工介入与抑制
- **session 开关**：  
  - `wa_sessions.auto_reply_state = 0` → 所有消息仅记录，不进入检索/推理。  
- **conversation 开关**（标点触发）：  
  - 末尾 `,` → `auto_reply_state=0`（开始人工介入）；  
  - 末尾 `.` → `auto_reply_state=1`（结束人工介入）。  
- **优先级**：session 开关 > conversation 开关。  
- **队列兜底检查**：在 `q_reply` 发送前再次判断。

### 5.4 防止 AI 误触发
- 在外发前对文本执行 `safeTrim`：去掉结尾单个 `,` 或 `.`。  
- 确保 AI 回复不会自己关闭/开启对话。

---

## 6. 接口（Hono RPC）

- **session 开关**  
  - `POST /rpc/wa.session.pause { waSessionId }`  
  - `POST /rpc/wa.session.resume { waSessionId }`
- **状态查询**  
  - `GET /rpc/wa/session.status?id=...` → 包含 `auto_reply_state`  
  - `GET /rpc/chat.status?chatKey=...`

---

## 7. 数据模型（D1）

```sql
users(
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_id TEXT UNIQUE,
  verified INTEGER DEFAULT 0,
  aihubmix_key TEXT,
  kb_limit INTEGER, agent_limit INTEGER, wa_limit INTEGER,
  created_at BIGINT, last_active_at BIGINT
);

kb_spaces(id TEXT PRIMARY KEY, user_id TEXT, name TEXT, created_at BIGINT);
kb_documents(id TEXT PRIMARY KEY, kb_id TEXT, filename TEXT, filetype TEXT, r2_key TEXT, status TEXT, created_at BIGINT);
kb_chunks(id TEXT PRIMARY KEY, kb_id TEXT, doc_id TEXT, chunk_index INT, text TEXT, vector_id TEXT, created_at BIGINT);

agents(id TEXT PRIMARY KEY, user_id TEXT, name TEXT, prompt_system TEXT, model TEXT, temperature REAL, created_at BIGINT);

wa_sessions(
  id TEXT PRIMARY KEY,
  wa_account_id TEXT NOT NULL,
  qr_code TEXT,
  status TEXT,
  created_at BIGINT,
  updated_at BIGINT,
  auto_reply_state INTEGER DEFAULT 1 -- 1=开, 0=关
);

conversations(
  id TEXT PRIMARY KEY,
  wa_account_id TEXT NOT NULL,
  chat_key TEXT NOT NULL,
  last_turn INT DEFAULT 0,
  updated_at BIGINT,
  auto_reply_state INTEGER DEFAULT 1 -- 1=开, 0=关
);

messages(id TEXT PRIMARY KEY, chat_key TEXT, turn INT, role TEXT, text TEXT, status TEXT, ts BIGINT);
jobs(id TEXT PRIMARY KEY, chat_key TEXT, turn INT, stage TEXT, status TEXT, created_at BIGINT, updated_at BIGINT);
```

---

## 8. 运行与边界
- **优先级**：session > conversation。  
- **误触发保护**：仅末尾单个标点触发。  
- **合并窗**：控制消息不参与合并，应立即生效。  
- **恢复策略**：暂停期间不回放旧答复。  

---

## 9. 非功能目标
- Webhook P95 < 50ms。  
- 合并窗 2s（可调）。  
- 单会话强顺序，无需数据库锁。  
- 队列：重试 + DLQ；`q_reply` 再次检查开关。  
- 提供用户总量、消息总量统计。

---

## 10. 知识库向量化与召回（Cloudflare Vectorize）

### 10.1 存储架构
- **Vectorize**：存 embedding 向量 + metadata（user_id, kb_id 等）。  
- **D1**：存 chunk 原文、映射关系。  
- **R2**：存原始文件。  

### 10.2 插入流程
1. 切片文档 → 调 aihubmix Embedding → 得向量  
2. 写入 Vectorize：  
   ```js
   await env.VEC.insert([
     { id: "docA:0001", values: embedding, metadata: { user_id, kb_id, doc_id, chunk_index: 1 } }
   ]);
   ```
3. 同步写入 D1：保存 chunk 文本、vector_id。

### 10.3 查询流程
1. 对用户问题生成向量：`qVec = embed(question)`  
2. 调用 Vectorize 查询：  
   ```js
   const res = await env.VEC.query({ vector: qVec, topK: 8, filter: { user_id, kb_id } });
   ```
3. 在 D1 回表：根据返回的 `id` 获取原文片段。  
4. 拼接 Prompt 给大模型。

### 10.4 命名空间与过滤
- **Namespace**：用于粗粒度隔离（每用户一个）。  
- **Metadata 索引**：用于精细过滤（如 user_id + kb_id）。

### 10.5 常见注意点
- 维度必须和模型一致；换 embedding 模型需重建索引。  
- 批量写入更高效。  
- 一个索引最多 10 个 metadata 索引字段。  
- 检索时：先过滤 → 再排序 → 再取 topK。  

---