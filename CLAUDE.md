# Claude Code 项目配置

这是 WA-Agent 项目的 Claude Code 配置文件，包含了项目的基本信息和常用命令。

## 项目信息

- **项目名称**: WA-Agent - 多租户 WhatsApp 智能客服平台
- **技术栈**: Cloudflare Workers + Hono + TypeScript + Drizzle ORM + Better Auth
- **开发环境**: http://localhost:8787
- **版本**: 1.0.0

## 常用命令

### 开发相关
```bash
# 启动开发服务器
bun run dev:backend

# 类型检查
bun run typecheck:backend

# 代码格式化和检查
bun run lint
bun run format

# 构建项目
bun run build:backend
```

### 数据库相关
```bash
# 生成数据库迁移
bun run db:generate

# 应用数据库迁移
bun run db:migrate

# 数据库种子数据
bun run db:seed

# 本地数据库操作
bun run db:local:apply
```

### 部署相关
```bash
# 部署到 staging
wrangler deploy --env staging

# 部署到 production  
wrangler deploy --env production
```

## 项目结构

```
├── src/
│   ├── index.ts                 # 主应用入口
│   ├── types.ts                 # TypeScript 类型定义
│   ├── lib/
│   │   └── auth.ts             # Better Auth 配置
│   ├── middleware/
│   │   ├── error-handler.ts    # 错误处理中间件
│   │   └── request-logger.ts   # 请求日志中间件
│   └── routes/
│       ├── auth-demo.ts        # 认证演示页面
│       └── api/
│           └── index.ts        # API 路由定义
├── database/
│   ├── schema/                 # 数据库模式定义
│   └── migrations/             # 数据库迁移文件
├── scripts/                    # 辅助脚本
├── wrangler.toml              # Cloudflare Workers 配置
└── package.json               # 项目依赖和脚本
```

## API 端点

### 系统端点
- `GET /api/health` - 基础健康检查
- `GET /api/health?detailed=true` - 详细健康检查  
- `GET /api/version` - 版本信息
- `GET /api/stats` - 系统统计（需认证）

### 认证端点
- `ALL /api/auth/*` - Better Auth 处理器
- `GET /auth/demo` - 认证演示页面

### 知识库管理端点
- `POST /api/knowledge-base` - 创建知识库
- `GET /api/knowledge-base` - 获取知识库列表
- `GET /api/knowledge-base/:kb_id` - 获取知识库详情
- `PUT /api/knowledge-base/:kb_id` - 更新知识库
- `DELETE /api/knowledge-base/:kb_id` - 删除知识库

### 文档管理端点
- `POST /api/documents/upload` - 上传文档文件
- `POST /api/documents/process/:doc_id` - 处理文档并生成切片
- `GET /api/documents/list/:kb_id` - 获取知识库文档列表
- `GET /api/documents/supported-formats` - 获取支持的文件格式
- `GET /api/documents/:doc_id` - 获取文档详情
- `DELETE /api/documents/:doc_id` - 删除文档

### 测试端点（仅开发环境）
- `GET /api/test/echo` - Echo 测试
- `POST /api/test/validate` - 数据验证测试
- `GET /api/test/error/:type` - 错误处理测试

## 环境变量

### 必需的环境变量（通过 .dev.vars 设置）
- `BETTER_AUTH_SECRET` - Better Auth 密钥
- `BETTER_AUTH_URL` - Better Auth URL
- `GOOGLE_CLIENT_ID` - Google OAuth 客户端 ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth 客户端密钥

### 可选的环境变量
- `AIHUBMIX_API_KEY` - AI Hub Mix API 密钥
- `WAHA_API_URL` - WAHA API 地址
- `WAHA_API_KEY` - WAHA API 密钥

## 开发指南

### 添加新的 API 端点

1. 在 `src/routes/api/index.ts` 中定义新路由
2. 使用 Zod 进行请求验证
3. 使用 ApiErrors 进行错误处理
4. 确保类型安全（RPC 模式）

示例：
```typescript
const newRoute = api.post(
  "/example",
  zValidator("json", z.object({
    name: z.string(),
  })),
  async (c) => {
    const { name } = c.req.valid("json");
    return c.json({ message: `Hello ${name}!` });
  }
);
```

### 数据库操作

使用 Drizzle ORM 进行数据库操作：
```typescript
const users = await c.env.DB
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, email));
```

### 错误处理

使用预定义的 ApiErrors：
```typescript
import { ApiErrors } from "../middleware/error-handler";

// 抛出标准错误
throw ApiErrors.NotFound("User not found");
throw ApiErrors.ValidationError("Invalid input", { field: "email" });
```

## 已完成任务

- ✅ T001: 项目初始化和配置
- ✅ T002: 数据库架构设计和迁移  
- ✅ T003: Better Auth 认证系统
- ✅ T004: 基础 API 框架
  - Hono RPC 类型安全路由
  - Zod 请求验证
  - 错误处理中间件
  - 请求日志和性能监控
  - 基础 API 路由结构
- ✅ T005: 文件上传与存储系统
  - 多格式文件上传支持（TXT, MD, PDF, Word, Excel, PPT）
  - Cloudflare R2 存储集成
  - 文件元数据管理和数据库记录
  - 文件大小限制和格式验证（50MB）
  - 安全文件命名和路径管理
  - 完整的 CRUD API 端点
- ✅ T006: 文档解析与处理系统
  - 多格式文档处理器（PDF, Word, Excel, PowerPoint, Text, Markdown）
  - 智能文档切片算法（1000字符块，200字符重叠）
  - 内容清理和格式化
  - 切片质量验证和数据库存储
  - 处理状态跟踪和错误处理
  - 文档处理API端点
- ✅ T007: 网页内容抓取系统
  - 单URL智能内容提取（linkedom库支持）
  - Sitemap XML解析和批量处理（fast-xml-parser）
  - 智能内容清理和主体内容识别
  - 批量爬取队列和并发控制
  - Robots.txt合规性检查
  - 抓取频率限制和重试机制
  - 完整的网页爬取API端点（/api/web-scraper/*）
- ✅ T008: 向量化与 Vectorize 集成
  - AIHubMix Embeddings API 集成和批量处理
  - Cloudflare Vectorize 向量数据库集成
  - 向量化处理队列系统（QUEUE_EMBED）
  - 语义搜索和相似度匹配功能
  - 向量索引管理和元数据关联
  - 完整的向量搜索API端点（/api/vector-search/*）
  - 与文档处理管道的无缝集成
  - TypeScript严格模式兼容性
- ✅ T009: 知识库管理系统
  - 知识库CRUD API（创建、列表、详情、更新、删除）
  - 用户配额检查和限制管理
  - 级联删除（文档、切片、向量数据清理）
  - 知识库统计信息（文档数量、存储大小）
  - 语义搜索集成（/api/knowledge-base/:kb_id/search）
  - 完整的知识库管理API端点（/api/knowledge-base/*）
  - 与向量化系统无缝集成
- ✅ T010: AIHubMix 客户端集成
  - 企业级AIHubMix客户端（多模型支持：GPT、Claude、Gemini）
  - AES-256-GCM API密钥加密存储和管理
  - 分布式速率限制（Cloudflare KV + 内存备选）
  - 聊天补全API完整实现（温度、令牌数等参数配置）
  - 增强版嵌入API集成（批处理、错误处理）
  - 模型列表和参数动态配置
  - API密钥实时验证和用户信息获取
  - 指数退避重试机制和自定义错误类型
  - 请求指标收集和性能监控
  - 完整的测试API端点（/api/aihubmix/*）
- ✅ T011: 智能体配置管理
  - 完整的智能体CRUD操作API（/api/agents/*）
  - 智能体模板系统（客服助手、销售助手、技术支持）
  - 系统提示词编辑和验证（最长4000字符）
  - AI模型选择和参数配置（温度、最大令牌数等）
  - 知识库关联和优先级配置系统
  - 智能体实时测试和预览功能
  - 从模板快速创建智能体功能
  - 与向量化搜索的无缝集成
  - TypeScript严格模式完全兼容
- ✅ T012: 对话测试系统
  - 完整的对话测试框架（/api/dialog-testing/*）
  - 测试会话管理和对话跟踪系统
  - 实时消息发送和AI响应测试
  - 知识库检索结果和调试信息显示
  - 测试用例创建和自动化运行
  - 性能指标收集和分析工具
  - 错误分析和响应时间分布统计
  - 测试历史记录和结果比较
  - 14个综合API端点支持所有测试场景
  - 与智能体和知识库系统完全集成
- ✅ T013: WAHA API 客户端集成
  - 完整的WAHA API客户端实现（TypeScript类型安全）
  - WhatsApp会话创建和管理功能
  - QR码获取和状态实时监控
  - Webhook配置和HMAC签名验证
  - 消息发送和"正在输入"状态支持
  - 会话重启和错误恢复机制
  - WAHA版本兼容性检查和连接测试
  - 9个会话管理API端点（/api/waha/*）
  - Webhook处理系统（/api/webhooks/*）
  - 与现有数据库架构完全集成
- ✅ T014: WhatsApp 会话管理
  - 基于T013增强的会话管理系统（12个API端点）
  - QR码智能轮询更新功能（/api/waha/sessions/:id/poll）
  - 用户配额检查集成（waLimit字段验证）
  - 会话健康监控系统（/api/waha/sessions/health）
  - 详细会话统计信息（/api/waha/sessions/:id/stats）
  - 用户配额使用情况查询（/api/waha/quota）
  - 会话状态实时同步和数据库更新
  - 长时间未更新会话检测（24小时阈值）
  - WAHA API连接状态验证和故障诊断
  - 完整的会话生命周期管理（创建、监控、重启、删除）
  - TypeScript严格模式完全兼容
  - 与用户权限系统无缝集成
- ✅ T015: Webhook 处理系统
  - 生产级Webhook处理系统（基于T013增强）
  - KV幂等性检查（24小时TTL防重复处理）
  - 异步处理优化（executionCtx.waitUntil）
  - 响应时间优化（<50ms P95）
  - 实时监控指标和每日统计（KV存储）
  - 多事件类型支持（message/session.status/message.ack/call）
  - 请求追踪系统（唯一requestId）
  - Webhook监控端点（/api/webhooks/monitor）
  - 失败重试机制（/api/webhooks/retry/:requestId）
  - 增强版测试工具（/api/webhooks/test）
  - HMAC SHA-256签名验证
  - 完整错误处理和日志记录
- ✅ T016: Durable Objects 消息合并
  - ChatSessionDO类完整实现（强顺序处理）
  - 2秒消息合并窗口（Durable Object Alarms API）
  - 智能消息合并算法（标点符号感知连接）
  - 可配置合并窗口（1.5-3秒动态调整）
  - chatKey管理（userId:waAccountId:whatsappChatId格式）
  - 状态持久化和故障恢复（DO storage API）
  - 与Webhook系统无缝集成
  - 消息缓冲区管理和自动刷新
  - API端点（/api/message-merge/*）
  - 测试端点和状态监控功能
- ✅ T017: 人工介入控制系统
  - 双层人工介入控制（Session > Conversation 优先级）
  - ManualInterventionController 服务类（/src/services/manual-intervention.ts）
  - Session级控制API（暂停/恢复整个WhatsApp账号）
  - Conversation级标点控制（逗号暂停，句号恢复）
  - 与ChatSessionDO深度集成（消息处理前检查）
  - 9个人工介入API端点（/api/intervention/*）
  - KV存储的审计日志（30天TTL）
  - safeTrim函数防止AI误触发
  - 介入状态查询和统计功能
  - 完整的测试端点验证控制逻辑
- ✅ T018: 消息处理队列系统
  - 三阶段队列处理流水线（retrieve → infer → reply）
  - q_retrieve队列：知识库向量检索，多知识库优先级排序
  - q_infer队列：AIHubMix智能推理，上下文管理
  - q_reply队列：拟人化回复，打字指示器，消息分段，随机延迟
  - 每个队列都集成人工介入检查
  - jobs表跟踪处理状态（pending/processing/completed/failed/suppressed）
  - Cloudflare Queues配置（wrangler.toml）
  - 队列处理器导出和路由（/src/index.ts）
  - 完整的错误处理和重试机制
  - 性能指标收集（KV存储）
- ✅ T019: 拟人化回复系统
  - HumanizationService类实现（/src/services/humanization.ts）
  - 基于WPM（Words Per Minute）的打字速度模拟（20-60 WPM可配置）
  - 智能消息分段算法（段落、句子、自然断点识别）
  - 可配置速度预设（fast/normal/slow/custom）
  - 思考延迟、打字时长、段间停顿等人性化特征
  - 集成到q_reply队列处理器，替换原有简单延迟逻辑
  - 增强的性能指标收集（WPM统计、时间分布）
  - 指数退避重试机制（最多3次重试）
  - 支持中英文混合文本的智能分段

## 注意事项

1. **类型安全**: 项目使用严格的 TypeScript 配置，确保类型安全
2. **错误处理**: 所有错误都通过统一的错误处理中间件处理
3. **日志记录**: 请求日志包含性能指标和错误追踪
4. **开发环境**: 测试端点仅在开发环境可用
5. **认证状态**: Google OAuth 需要配置有效凭据才能使用
6. **任务完成工作流**: 每完成一个任务后必须：
   - 在 docs/TASKS.md 中标记任务为完成状态
   - 更新本 CLAUDE.md 文件的"已完成任务"部分
   - 提交代码变更到 git 仓库
   - 保持任务状态与实际进度同步

## 下一步

继续执行 TASKS.md 中的后续任务：
- T020: 前端基础架构
- T021: 用户认证界面
- T022: 知识库管理界面
- ...等前端开发任务