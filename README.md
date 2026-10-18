# ukiyo-e

AI 制图工作流网站。前后端统一 TypeScript，采用 npm workspaces 单仓多包。

## 1. 快速开始

### 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

打开 <http://localhost:5173>。

### Docker 部署

先在根目录 `.env` 中配置必要变量：

```dotenv
JWT_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password
KIE_API_KEY=your-kie-api-key
```

启动服务：

```bash
docker compose up --build -d
```

打开 <http://localhost:8080>。

停止服务：

```bash
docker compose down
```

## 2. 常用命令

```bash
npm run dev              # 同时启动前端和后端
npm run dev:web          # 只启动前端
npm run dev:api          # 只启动后端
npm run build            # 构建所有 workspace
npm run typecheck        # TypeScript 类型检查
npm run test             # Vitest 单元测试和集成测试
npm run lint             # ESLint 检查
npm run test:e2e         # Playwright E2E 测试
npm run test:banana      # 使用 KIE_API_KEY 测试 Nano Banana API
```

运行 E2E 测试前，如本地尚未安装 Chromium：

```bash
npx playwright install chromium
```

针对 Docker 部署运行 E2E：

```bash
docker compose up --build -d
npm run test:e2e:docker
docker compose down -v
```

## 3. 技术栈

- 前端：React、Vite、TanStack Query、CSS Modules
- 后端：Fastify、SQLite（Node 原生 `node:sqlite`）、zod
- 共享层：TypeScript、共享 zod schema
- 测试：Vitest、Playwright
- 部署：Docker、nginx
- 认证：HttpOnly Cookie、无状态 JWT、Node `crypto.scrypt`

## 4. 目录结构

```text
ukiyo-e/
├── apps/
│   ├── web/         # React + Vite 前端
│   └── api/         # Fastify API、SQLite、Worker
├── packages/
│   └── shared/      # 前后端共享的 schema 与类型
├── docs/            # API、认证、数据库和管理员设计文档
├── e2e/             # Playwright E2E 测试
├── docker-compose.yml
└── package.json
```

## 5. 其他

### 业务功能

- 用户可以注册、登录、创建图片生成任务和查看任务历史。
- 每个图片生成任务固定消耗 1 积分；余额不足时不会调用 AI 供应商。
- AI 供应商创建任务失败时自动退回本次消耗的积分。
- 用户可以在主页查看积分余额和积分变化记录。
- 管理员可以创建、查找用户并调整用户积分。

### 图片存储

- 图片默认保存在 `./data`，可通过 `STORAGE_ROOT` 修改。
- Docker 中通常使用 `/app/data`，数据由 `api-data` 卷持久化。
- 图片路径为 `${STORAGE_ROOT}/images/{taskId}/`。
- 文件命名规则为 `{position}-{randomUUID}.{extension}`。
- 支持 PNG、JPEG 和 WebP。
- SQLite 只保存图片路径、类型、大小、SHA-256 等元数据。
- 图片通过鉴权接口 `GET /api/images/:imageId` 读取。

### 数据与配置

- `DATABASE_URL` 的相对路径按 `apps/api/` 解析。
- 测试使用 `:memory:` 数据库，避免污染本地数据。
- `JWT_SECRET` 缺失或过短时，API 启动失败。
- `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 用于启动时引导管理员。
- `KIE_API_KEY` 用于调用图片生成供应商。
- 生产环境应使用 HTTPS，并将 Cookie 配置为 Secure。

### 文档

| 文档 | 内容 |
| --- | --- |
| [docs/api.md](./docs/api.md) | API 接口、参数、状态码和错误码的单一事实来源 |
| [docs/auth-design.md](./docs/auth-design.md) | 认证与用户系统设计 |
| [docs/admin-design.md](./docs/admin-design.md) | 管理员与积分管理设计 |
| [docs/database-design.md](./docs/database-design.md) | 数据库表与积分流水设计 |
| [AGENTS.md](./AGENTS.md) | 项目开发约定 |
