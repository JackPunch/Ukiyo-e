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
