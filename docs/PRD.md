# 产品需求文档 (PRD)
# WA-Agent - 多租户 WhatsApp 智能客服平台

更新时间：2025-09-07

---

## 0. 需求概述

本项目要实现一个 **WhatsApp 智能客服系统**，让企业或个人用户可以快速搭建属于自己的智能机器人，帮助他们自动回复客户消息，减少人工工作量。

**一句话总结**：  
这个系统让用户通过扫码绑定自己的 WhatsApp 账号，再上传资料、创建机器人，就能让 AI 自动回答客户的问题，还能随时手动暂停或介入。

## 1. 产品概述

### 1.1 产品愿景
通过AI技术和自动化，让企业能够轻松部署智能WhatsApp客服机器人，提供24/7的客户服务支持，同时保持人工介入的灵活性。

### 1.2 产品定位
- **多租户SaaS平台**：支持数千个企业用户独立使用
- **自助式AI客服**：用户可自行配置知识库、智能体和WhatsApp机器人
- **用户自配WAHA**：支持用户使用自己的WAHA API服务
- **双层人工介入**：提供管理员和用户级别的人工控制机制

### 1.3 核心价值主张
1. **零技术门槛**：图形化界面配置，无需编程知识
2. **自主可控**：用户使用自己的WAHA API和AIHubMix API
3. **智能合并消息**：2秒窗口合并短消息，减少AI调用成本
4. **灵活人工介入**：支持紧急暂停和精准聊天控制
5. **企业级安全**：数据加密、签名验证、多租户隔离

---

## 2. 用户画像

### 2.1 主要用户群体

#### 画像1：中小企业主
- **特征**：电商、服务业等需要客户支持的企业主
- **痛点**：客服成本高、无法24/7响应、重复问题多
- **需求**：简单易用、成本可控、效果明显
- **使用场景**：处理常见询价、订单查询、售后支持

#### 画像2：客服团队负责人
- **特征**：中大型公司的客服部门管理者
- **痛点**：客服工作量大、培训成本高、服务质量不稳定
- **需求**：减轻人工负担、标准化服务、保持服务质量
- **使用场景**：自动处理常见问题、人工介入复杂问题

#### 画像3：技术服务商
- **特征**：为其他企业提供WhatsApp客服解决方案的服务商
- **痛点**：需要为每个客户单独部署和维护系统
- **需求**：多客户管理、白标支持、技术集成便利
- **使用场景**：为多个客户提供统一的智能客服平台

---

## 3. 功能需求

### 3.1 核心功能模块

#### 3.1.1 用户认证与管理
**优先级：P0**

**功能描述：**
- Google OAuth 一键登录
- 新用户需管理员审核后激活
- 基于角色的权限控制（普通用户 vs 超级管理员）

**验收标准：**
- 用户可通过Google账号快速注册和登录
- 新注册用户处于待审核状态，无法使用核心功能
- 管理员可批量审核用户，设置用户配额
- 安全的会话管理，支持自动登出

#### 3.1.2 知识库管理
**优先级：P0**

**功能描述：**
- 支持多种文档格式上传（TXT, PDF, Word, Markdown, Excel, PPT）
- 从网页URL或Sitemap批量抓取内容
- 自动文档处理和向量化（用户无需配置）
- 基于相似度的知识检索

**技术细节：**
- 文档自动切片（默认1000字符，200字符重叠）
- 使用系统统一的Embedding模型（通过用户自己的AIHubMix API）
- 存储到Cloudflare Vectorize进行向量检索
- 支持实时搜索和测试

**验收标准：**
- 支持拖拽上传，单文件最大50MB
- 文档处理状态实时显示（处理中/完成/失败）
- 知识库搜索结果准确，响应时间<2秒
- 支持知识库内容的增删改查

#### 3.1.3 AI智能体配置
**优先级：P0**

**功能描述：**
- 用户配置自己的AIHubMix API密钥
- 支持多种大语言模型选择（GPT、Claude、Gemini等）
- 系统提示词自定义编辑
- 智能体与知识库的关联配置

**技术细节：**
- API密钥加密存储（AES-256-GCM）
- 支持温度、最大Token等参数调节
- 知识库优先级和权重配置
- 智能体测试和预览功能

**验收标准：**
- API密钥验证和连接测试
- 支持常见模型的参数配置
- 可关联多个知识库，支持优先级排序
- 提供智能体对话测试功能

#### 3.1.4 WhatsApp机器人管理
**优先级：P0**

**功能描述：**
- 用户配置自己的WAHA API服务
- 自动生成和配置Webhook URL
- 二维码扫描和连接管理
- 机器人状态监控和管理

**技术细节：**
- WAHA API连接测试和验证
- 自动配置Webhook回调地址
- 支持WAHA和WAHA-Plus版本
- 会话状态实时监控

**验收标准：**
- WAHA API配置验证通过
- 二维码生成和展示正常
- 扫码后连接状态实时更新
- 支持重连、断开、删除等操作

### 3.2 高级功能

#### 3.2.1 智能消息合并
**优先级：P1**

**功能描述：**
- 2秒窗口内的连续消息自动合并
- 减少AI API调用次数，降低成本
- 通过Durable Objects确保消息顺序

**技术实现：**
- 使用Cloudflare Durable Objects处理消息
- 可配置的合并窗口（1.5-3秒）
- 智能判断消息是否适合合并
- 强顺序处理确保消息不丢失

**验收标准：**
- 短消息在2秒内自动合并
- 长消息或带结束标点的消息立即处理
- 合并后的消息语义完整
- 消息处理顺序严格按时间排序

#### 3.2.2 拟人化回复
**优先级：P1**

**功能描述：**
- "正在输入"状态模拟
- 可变的回复延迟（2-5秒）
- 长消息自动分段发送
- 自然的消息节奏控制

**技术实现：**
- 根据内容长度计算输入时间（20-60 WPM）
- 在句子边界智能切分长消息
- 消息间随机延迟增加真实感
- 可配置的拟人化参数

**验收标准：**
- 输入状态显示时间合理
- 消息分段在合适位置切分
- 回复节奏自然，不会过快或过慢
- 用户感受接近真人对话

#### 3.2.3 双层人工介入系统
**优先级：P0**

**功能描述：**
- **Session级控制**：管理员后台一键暂停整个WhatsApp账号
- **Conversation级控制**：用户通过标点符号控制特定聊天
- 优先级：Session级 > Conversation级
- 暂停期间仅记录消息，不自动回复

**标点符号控制：**
- **`,`（半角逗号）** → 开始人工介入（暂停该聊天自动回复）
- **`.`（半角句号）** → 结束人工介入（恢复该聊天自动回复）

**技术保障：**
- AI回复前自动剪裁末尾标点，防止误触发
- 队列兜底检查，确保状态同步
- 状态变更日志记录和审计

**验收标准：**
- 管理员可一键暂停/恢复任何用户的机器人
- 用户发送逗号后，该聊天立即停止自动回复
- 用户发送句号后，该聊天恢复自动回复
- Session级暂停时，所有标点控制失效
- 暂停期间的消息都被记录但不回复

### 3.3 管理功能

#### 3.3.1 超级管理员后台
**优先级：P0**

**功能描述：**
- 用户审核和管理
- 资源配额配置
- 系统运行状态监控
- 使用统计和分析

**具体功能：**
- 批量审核待激活用户
- 设置用户资源限制（知识库数、智能体数、机器人数）
- 暂停/激活用户账号
- 查看系统总体使用情况

**验收标准：**
- 管理员可快速审核新用户
- 可灵活设置每用户的资源配额
- 提供清晰的系统使用统计
- 支持按用户查看使用详情

#### 3.3.2 用户配额管理
**优先级：P0**

**功能描述：**
- 知识库数量限制
- AI智能体数量限制  
- WhatsApp机器人数量限制
- 存储空间配额
- API调用次数限制

**实现机制：**
- 创建资源前检查配额
- 接近限制时提醒用户
- 超出限制时阻止创建
- 支持管理员调整配额

**验收标准：**
- 各类资源都有明确的数量限制
- 用户可查看当前使用情况和剩余配额
- 超出限制时有清晰的错误提示
- 配额调整立即生效

---

## 4. 非功能性需求

### 4.1 性能要求

#### 4.1.1 响应时间
- **Webhook处理**：P95 < 50ms（仅入队）
- **API响应**：P95 < 500ms
- **消息合并窗口**：2s（可配置1.5-3s）
- **端到端响应**：< 3秒（接收到发送）

#### 4.1.2 吞吐量
- **并发用户**：10,000+
- **消息处理**：1,000消息/秒
- **Webhook接收**：5,000请求/秒
- **数据库查询**：100,000查询/秒

#### 4.1.3 可用性
- **系统可用性**：99.9%
- **数据持久性**：99.999%
- **灾难恢复**：RTO < 4小时，RPO < 15分钟

### 4.2 安全要求

#### 4.2.1 数据安全
- **API密钥加密**：AES-256-GCM静态加密
- **传输安全**：全站HTTPS，TLS 1.3
- **多租户隔离**：严格的用户数据隔离
- **访问控制**：基于角色的权限控制

#### 4.2.2 Webhook安全
- **签名验证**：HMAC-SHA256签名验证
- **重放攻击防护**：时间窗口±300秒
- **幂等性保证**：KV存储防止重复处理
- **审计日志**：完整的操作日志记录

#### 4.2.3 合规要求
- **数据隐私**：符合GDPR要求
- **数据驻留**：支持数据本地化
- **审计追踪**：完整的用户操作审计
- **密钥轮换**：支持加密密钥定期轮换

### 4.3 扩展性要求

#### 4.3.1 水平扩展
- **无状态设计**：Workers自动扩缩容
- **数据库分片**：支持多区域部署
- **缓存分层**：KV缓存减少数据库压力
- **队列处理**：异步队列处理重任务

#### 4.3.2 模块化架构
- **微服务设计**：每个功能模块独立
- **API接口标准化**：统一的接口规范
- **插件化扩展**：支持第三方集成
- **版本兼容性**：向后兼容的API设计

---

## 5. 用户体验设计

### 5.1 界面设计原则

#### 5.1.1 简洁直观
- **最小化学习成本**：符合用户认知习惯
- **渐进式披露**：复杂功能分步展示
- **视觉层次清晰**：重要功能突出显示
- **操作反馈及时**：每个操作都有明确反馈

#### 5.1.2 响应式设计
- **多设备适配**：桌面、平板、手机全支持
- **触摸友好**：适合移动设备操作
- **快速加载**：首屏加载时间 < 2秒
- **离线处理**：网络异常时的友好提示

### 5.2 关键用户流程

#### 5.2.1 新用户引导流程
```
注册登录 → 等待审核 → 审核通过通知 → 
设置AIHubMix API → 创建知识库 → 上传文档 → 
配置智能体 → 关联知识库 → 配置WAHA → 
扫码连接WhatsApp → 测试对话 → 正式使用
```

#### 5.2.2 日常使用流程
```
登录系统 → 查看机器人状态 → 查看对话记录 → 
人工介入（如需要） → 更新知识库 → 优化智能体 → 
查看使用统计 → 管理配额
```

#### 5.2.3 人工介入流程
```
发现需要人工介入 → 
方式1：管理员后台暂停整个账号 →
方式2：客户发送逗号暂停单个聊天 →
人工处理问题 → 
方式1：管理员后台恢复账号 →
方式2：客户发送句号恢复聊天 →
自动回复恢复正常
```

### 5.3 错误处理和用户提示

#### 5.3.1 友好的错误信息
- **明确的错误原因**：告诉用户具体哪里出错
- **可行的解决方案**：提供具体的修复建议
- **联系支持方式**：复杂问题提供人工支持
- **错误代码**：技术支持参考

#### 5.3.2 操作确认机制
- **重要操作确认**：删除、暂停等操作需要确认
- **批量操作提示**：批量删除时显示影响范围
- **撤销机制**：支持误操作的撤销
- **操作日志**：用户可查看自己的操作历史

---

## 6. 技术架构

### 6.1 总体架构

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

### 6.2 数据库设计（D1 SQLite）

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

-- WhatsApp会话表
CREATE TABLE wa_sessions (
  id TEXT PRIMARY KEY,
  wa_account_id TEXT NOT NULL,
  qr_code TEXT,
  status TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  auto_reply_state INTEGER DEFAULT 1  -- 1=开启, 0=暂停
);

-- 对话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  wa_account_id TEXT NOT NULL,
  chat_key TEXT NOT NULL UNIQUE,
  last_turn INTEGER DEFAULT 0,
  updated_at BIGINT,
  auto_reply_state INTEGER DEFAULT 1  -- 1=开启, 0=暂停
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

### 6.3 核心技术选型

#### 6.3.1 前端技术
- **框架**：React 18 + TypeScript
- **路由**：TanStack Router
- **状态管理**：TanStack Query
- **UI组件**：Radix UI + Tailwind CSS
- **构建工具**：Vite
- **API调用**：Hono RPC Client

#### 6.3.2 后端技术
- **运行时**：Cloudflare Workers
- **Web框架**：Hono + Hono RPC
- **认证**：Better Auth (Google OAuth)
- **数据库**：Cloudflare D1 (SQLite)
- **ORM**：Drizzle ORM + Drizzle-Zod
- **缓存**：Cloudflare KV
- **存储**：Cloudflare R2
- **向量数据库**：Cloudflare Vectorize
- **实时处理**：Durable Objects (ChatSessionDO)
- **队列**：Cloudflare Queues (q_retrieve/q_infer/q_reply)

### 6.3 数据流架构

#### 6.3.1 消息处理流程
```
WAHA Webhook → 签名验证 → 幂等检查 → 
ChatSessionDO → 人工介入检查 → 2s消息合并 → 
q_retrieve队列 → q_infer队列 → q_reply队列 → 
拟人化处理 → WAHA API发送
```

#### 6.3.2 人工介入控制
```
Session级控制（管理员）：
管理后台 → /rpc/wa.session.pause API → 更新数据库状态 → 
影响该session所有对话

Conversation级控制（标点符号）：
用户发送标点 → ChatSessionDO检测 → 
更新对话状态 → 影响单个聊天

优先级：Session级 > Conversation级
```

### 6.4 API 接口规范（Hono RPC）

#### 6.4.1 人工介入控制接口
```typescript
// Session级控制（管理员操作）
POST /rpc/wa.session.pause
Request: { waSessionId: string }
Response: { success: boolean }

POST /rpc/wa.session.resume  
Request: { waSessionId: string }
Response: { success: boolean }

// 状态查询
GET /rpc/wa.session.status?id={sessionId}
Response: {
  id: string;
  status: string;
  auto_reply_state: number; // 1=开启, 0=暂停
  created_at: number;
  updated_at: number;
}

GET /rpc/chat.status?chatKey={chatKey}
Response: {
  chat_key: string;
  auto_reply_state: number;
  last_turn: number;
  updated_at: number;
}
```

#### 6.4.2 WhatsApp会话管理接口
```typescript
// 创建会话
POST /rpc/wa.session.create
Request: { wahaApiUrl: string, wahaApiKey: string }
Response: { sessionId: string, webhookUrl: string }

// 获取二维码
GET /rpc/wa.session.qr?sessionId={sessionId}
Response: { qrCode: string } // Base64格式

// 会话操作
POST /rpc/wa.session.restart
Request: { sessionId: string }

POST /rpc/wa.session.delete
Request: { sessionId: string }
```

#### 6.4.3 队列处理流程
```
q_retrieve: 知识库向量检索
- Input: { chatKey, mergedText, timestamp }
- 调用Vectorize查询相关文档片段
- Output: 发送到q_infer队列

q_infer: AI推理生成
- Input: { chatKey, userMessage, context, timestamp }
- 调用AIHubMix API生成回复
- Output: 发送到q_reply队列

q_reply: 拟人化回复
- Input: { chatKey, aiResponse, timestamp }
- 兜底检查人工介入状态
- 拟人化处理（分段、延迟、输入状态）
- Output: 通过WAHA API发送消息
```

---

## 7. 部署和运维

### 7.1 环境配置

#### 7.1.1 开发环境
```bash
# 本地开发
BETTER_AUTH_SECRET=dev-secret-key
GOOGLE_CLIENT_ID=dev-google-client-id
GOOGLE_CLIENT_SECRET=dev-google-client-secret
ENCRYPTION_KEY=dev-32-byte-encryption-key
ADMIN_EMAILS=admin@example.com
DATABASE_URL=local-d1-database
```

#### 7.1.2 生产环境
```bash
# Cloudflare Workers 密钥
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put ADMIN_EMAILS
```

### 7.2 监控和告警

#### 7.2.1 关键指标监控
- **系统性能**：响应时间、吞吐量、错误率
- **人工介入**：暂停频率、恢复时间、使用统计
- **消息处理**：合并效率、处理延迟、成功率
- **资源使用**：数据库连接、队列长度、存储使用

#### 7.2.2 告警规则
- **性能异常**：响应时间超过阈值
- **错误率高**：错误率超过5%
- **服务不可用**：健康检查失败
- **资源耗尽**：存储或配额接近上限

---

## 8. 项目里程碑

### 8.1 MVP版本（4-6周）

#### 第1阶段：基础功能（2周）
- [ ] 用户认证系统（Google OAuth）
- [ ] 基础的管理后台
- [ ] 用户审核流程
- [ ] 资源配额管理

#### 第2阶段：核心功能（2周）
- [ ] 知识库创建和管理
- [ ] 文档上传和处理
- [ ] 智能体配置
- [ ] AIHubMix集成

#### 第3阶段：WhatsApp集成（2周）
- [ ] WAHA API集成
- [ ] 机器人创建和管理
- [ ] 消息处理流水线
- [ ] 人工介入基础功能

### 8.2 增强版本（2-3周）

- [ ] 智能消息合并
- [ ] 拟人化回复功能
- [ ] 完整的人工介入系统
- [ ] 网页内容抓取
- [ ] 高级统计分析

### 8.3 生产版本（1-2周）

- [ ] 性能优化
- [ ] 安全加固
- [ ] 监控告警完善
- [ ] 文档和测试完善
- [ ] 生产环境部署

---

## 9. 风险评估

### 9.1 技术风险

| 风险项 | 影响程度 | 发生概率 | 缓解措施 |
|--------|----------|----------|----------|
| WAHA API变更 | 高 | 中 | 版本兼容层，API变更监控 |
| Cloudflare服务限制 | 中 | 低 | 使用监控，备用方案准备 |
| 大语言模型API限制 | 高 | 中 | 多API支持，队列缓冲 |
| 数据库性能瓶颈 | 中 | 中 | 分片策略，缓存优化 |

### 9.2 业务风险

| 风险项 | 影响程度 | 发生概率 | 缓解措施 |
|--------|----------|----------|----------|
| 用户接受度低 | 高 | 中 | 用户调研，快速迭代 |
| WhatsApp政策变更 | 高 | 低 | 合规指南，政策跟踪 |
| 竞品冲击 | 中 | 高 | 差异化功能，用户黏性 |
| 数据安全事故 | 高 | 低 | 安全审计，应急预案 |

---

## 10. 成功指标

### 10.1 用户指标
- **注册用户数**：6个月内达到1000+
- **活跃用户率**：月活跃用户 > 60%
- **用户留存率**：30天留存 > 40%
- **功能使用率**：人工介入功能使用率 > 20%

### 10.2 技术指标
- **系统可用性**：> 99.9%
- **平均响应时间**：< 500ms
- **消息处理成功率**：> 99.5%
- **Webhook处理延迟**：< 50ms (P95)

### 10.3 业务指标
- **客户满意度**：NPS > 50
- **支持工单减少**：人工客服工单减少 > 70%
- **响应时效提升**：平均响应时间从小时级降到秒级
- **成本节约**：客服成本降低 > 50%

---

**总结**

WA-Agent致力于通过先进的AI技术和用户友好的设计，为企业提供高效、智能、安全的WhatsApp客服解决方案。通过双层人工介入机制，确保在自动化的同时保持服务质量和用户体验。