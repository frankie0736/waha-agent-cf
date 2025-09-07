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
- T011: 智能体配置管理
- T012: 对话测试系统
- T013: WhatsApp 集成
- ...等