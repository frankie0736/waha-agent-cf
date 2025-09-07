# WA-Agent - 多租户 WhatsApp 智能客服平台

基于 Cloudflare Workers 的企业级 WhatsApp 智能客服系统，支持 AI 自动回复、知识库管理和灵活的人工介入机制。

## ✨ 核心特性

- 🤖 **AI 智能回复**：基于 RAG 的知识库问答
- 👥 **多租户架构**：支持数千企业用户独立使用  
- 🔄 **双层人工介入**：Session级 + Conversation级控制
- ⚡ **消息智能合并**：2秒窗口优化AI调用成本
- 🛡️ **企业级安全**：数据加密、签名验证、多租户隔离
- 🚀 **极致性能**：Cloudflare 全球边缘计算

## 🏗️ 技术架构

- **运行时**: Cloudflare Workers
- **Web框架**: Hono + Hono RPC
- **数据库**: Cloudflare D1 (SQLite) + Drizzle ORM
- **向量搜索**: Cloudflare Vectorize
- **存储**: Cloudflare R2 + KV
- **实时处理**: Durable Objects
- **队列**: Cloudflare Queues
- **前端**: React + TanStack + Vite

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Bun (推荐) 或 npm
- Cloudflare 账号

### 本地开发

1. **克隆项目**
```bash
git clone <your-repo>
cd waha-agent-cf
```

2. **安装依赖**
```bash
bun install
```

3. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

4. **启动开发服务器**
```bash
# 启动后端和前端
bun run dev

# 或分别启动
bun run dev:backend  # Cloudflare Workers 开发服务器
bun run dev:frontend # React 开发服务器
```

5. **访问应用**
- 后端 API: http://localhost:8787
- 前端界面: http://localhost:5173

## 📊 项目结构

```
waha-agent-cf/
├── src/                    # 后端源码 (Cloudflare Workers)
│   ├── index.ts           # Worker 入口
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   ├── middleware/        # 中间件
│   └── types/             # 类型定义
├── frontend/              # 前端源码 (React)
├── database/              # 数据库 Schema 和迁移
│   ├── schema/            # Drizzle Schema
│   └── migrations/        # SQL 迁移文件
├── docs/                  # 项目文档
├── wrangler.toml         # Cloudflare Workers 配置
├── package.json
└── README.md
```

## 🛠️ 开发命令

```bash
# 开发
bun run dev                # 启动完整开发环境
bun run dev:backend       # 仅启动后端
bun run dev:frontend      # 仅启动前端

# 构建
bun run build             # 构建整个项目
bun run typecheck         # 类型检查

# 数据库
bun run db:generate       # 生成数据库迁移
bun run db:push:local     # 推送到本地数据库
bun run db:push:remote    # 推送到远程数据库
bun run db:studio         # 启动数据库管理界面

# 代码质量
bun run lint              # 检查代码规范
bun run lint:fix          # 自动修复代码问题
bun run format            # 格式化代码

# 部署
bun run deploy            # 部署到生产环境
```

## 📚 文档

- [产品需求文档 (PRD)](./PRD.md)
- [开发文档](./DEVELOPMENT.md) 
- [任务清单](./docs/TASKS.md)
- [API 文档](./docs/api.md)

## 🔒 环境变量配置

核心环境变量通过 `wrangler secret` 管理：

```bash
# 认证密钥
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID  
wrangler secret put GOOGLE_CLIENT_SECRET

# 数据加密密钥
wrangler secret put ENCRYPTION_KEY

# 管理员邮箱
wrangler secret put ADMIN_EMAILS
```

## 🚢 部署

### 1. 准备 Cloudflare 资源

```bash
# 创建 D1 数据库
wrangler d1 create waha-agent

# 创建 KV 命名空间  
wrangler kv:namespace create "WA_AGENT"

# 创建 R2 存储桶
wrangler r2 bucket create waha-agent-storage

# 创建 Vectorize 索引
wrangler vectorize create waha-agent-vectors --dimensions=1536
```

### 2. 更新 wrangler.toml

将创建的资源 ID 填入 `wrangler.toml` 配置文件。

### 3. 部署应用

```bash
bun run deploy
```

## 🤝 贡献

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📧 联系我们

- 问题反馈: [GitHub Issues](https://github.com/your-username/waha-agent-cf/issues)
- 邮箱: your-email@example.com

---

⭐ 如果这个项目对你有帮助，请给它一个 Star！