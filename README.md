# ukiyo-e

AI 制图工作流网站。前后端统一 TypeScript，npm workspaces 单仓多包。

## 技术栈

- 前端：React + Vite
- 后端：Fastify + SQLite（原生 SQL）+ zod
- 测试：Vitest + Playwright
- 部署：Docker

## 目录结构

```
ukiyo-e/
├── apps/
│   ├── web/         # 前端（React + Vite）
│   └── api/         # 后端（Fastify）
└── packages/
    └── shared/      # 前后端共享的 zod schema 与类型
```

## 快速开始

```bash
npm install
cp .env.example .env

npm run dev          # 前端 :5173，后端 :3000
```

打开 http://localhost:5173 。开发时 `/api/*` 会被 Vite 代理到后端，无需处理跨域。

## 常用脚本

```bash
npm run dev          # 同时启动前端与后端
npm run dev:web      # 只启动前端
npm run dev:api      # 只启动后端
npm run build        # 构建
npm run typecheck    # 类型检查
npm run test         # 测试
npm run lint         # ESLint
```

## 认证与用户系统

会话采用 **httpOnly Cookie + 无状态签名 JWT**（jose，HS256），服务端不存会话；密码用 `node:crypto` 的 **scrypt** 哈希（零依赖）。设计方案见 [docs/auth-design.md](./docs/auth-design.md)，**接口参数、状态码与错误码以 [docs/api.md](./docs/api.md) 为准**（`register` / `login` / `logout` / `me` 四个端点）。

前端路由：`/`（需登录的主页）、`/login`、`/register`；未登录访问受保护页面会跳转登录页并在登录后回跳。

首个管理员由环境变量引导，启动时执行、幂等：`ADMIN_EMAIL` 对应的账号不存在时用 `ADMIN_PASSWORD` 创建；已存在时**只提升角色、不重置密码**。

> 登出只清除浏览器 Cookie：无状态令牌在过期前始终有效，这是该方案的已知取舍（见设计文档 §12.1）。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/api.md](./docs/api.md) | **接口文档（单一事实来源）**：基础信息、参数、状态码、全部错误码 |
| [docs/auth-design.md](./docs/auth-design.md) | 认证与用户系统设计 |
| [docs/database-design.md](./docs/database-design.md) | 数据库表设计 |
| [AGENTS.md](./AGENTS.md) | 面向 AI 编码代理的项目约定，含"接口变化必须同步接口文档"的硬性要求 |

## Docker

```bash
docker compose up --build     # 构建并启动（前端 http://localhost:8080）
docker compose up -d          # 后台运行
docker compose down           # 停止并移除容器
docker compose logs -f        # 查看日志
```

前端由 nginx 托管并反向代理 `/api` 到后端，本地只需访问 http://localhost:8080 。

## 设计要点

- `packages/shared` 直接导出 `./src/index.ts`，不打包，前后端共用同一份 zod schema。
- 后端 `server.ts`（构建实例）与 `index.ts`（监听端口）分离，方便测试用 `app.inject()`。
- 后端用 `tsx` 直接运行 TS 源码，无需编译产物。
- 数据库用 Node 内置的 `node:sqlite`（零依赖、无原生编译）。连接与 PRAGMA 见 `apps/api/src/db/client.ts`；`buildServer` 启动时自动执行迁移并把连接挂到 `app.db`，关闭时释放。
- 迁移是 `apps/api/src/db/migrations/*.sql` 里的原生 SQL，按文件名顺序执行并记录到 `_migrations` 表——新增迁移只要加一个 `0002_xxx.sql`。
- `DATABASE_URL` 的相对路径按 `apps/api/` 解析（而非 cwd）；测试传入 `:memory:` 得到隔离的内存库。
- `buildServer()` 是 async：启动时先校验认证配置（`JWT_SECRET` 缺失或过短直接抛错），再迁移数据库、执行管理员引导，最后才监听。
- 认证配置与两个 `preHandler` 挂在根实例上（`app.authConfig` / `app.requireAuth` / `app.requireAdmin`），路由插件直接继承使用；`request.user` 由 `requireAuth` 写入。
- 鉴权以数据库为准：令牌只带用户 ID，每次请求回查 `users`，因此改角色立即生效、删用户立即失效。
- `packages/shared` 里的 zod schema 同时定义请求体、响应体与错误码枚举（`schemas/errors.ts`），后端用同一个 `errorBody()` 组装错误体。
- 非 2xx 响应一律使用统一错误信封：路由返回的 4xx 之外，Fastify 自身产生的客户端错误（如畸形 JSON、请求体超限）与未匹配路由的 404 也由 `server.ts` 的 `setErrorHandler` / `setNotFoundHandler` 归一到同一格式，完整错误码目录见 [docs/api.md](./docs/api.md)。
