# 项目指南（面向 AI 编码代理）

ukiyo-e：AI 制图工作流网站。npm workspaces 单仓多包 —— `apps/web`（React + Vite）、`apps/api`（Fastify + `node:sqlite` 原生 SQL）、`packages/shared`（前后端共享 zod schema）。

技术栈与常用脚本见 [README.md](./README.md)；开发路线图见 [note.md](./note.md)。

## 文档同步（硬性要求）

改代码必须同步对应文档。**涉及接口的改动，不同步 [docs/api.md](./docs/api.md) 视为未完成。**

| 改动内容 | 必须同步更新 |
| --- | --- |
| **任何接口变化**：新增/删除端点、改路径或方法、增删改请求或响应字段、增删状态码或**错误码**、改参数校验规则或 Cookie 属性 | [docs/api.md](./docs/api.md) —— 接口的**单一事实来源**（基础信息、参数、状态码、错误码、示例）。错误码需与 [docs/api.md](./docs/api.md) §3 表格、`packages/shared/src/schemas/errors.ts` 的枚举**三方一致** |
| 表结构 / 列 / 索引 / 外键 | 新增迁移 `apps/api/src/db/migrations/NNNN_*.sql` + [docs/database-design.md](./docs/database-design.md) |
| 认证或会话行为（Cookie 属性、令牌内容与有效期、鉴权中间件、管理员引导） | [docs/auth-design.md](./docs/auth-design.md)（并核对 [docs/api.md](./docs/api.md) 的认证章节） |
| 环境变量 / 脚本 / 部署方式 | `.env.example`、`docker-compose.yml`、[README.md](./README.md) |

新增端点后，除了补 [docs/api.md](./docs/api.md) 的端点条目，也要在错误码总表中补上它可能返回的新错误码。

这条规则**不靠自觉**：`apps/api/src/docs.test.ts` 会比对已注册路由与 `docs/api.md`、以及 §3 错误码表格与 `apiErrorCodeSchema` 枚举，漏改即测试失败。改动后至少执行 `npm run typecheck && npm run test && npm run lint`。

## 技术约定

- **契约先行**：请求/响应/错误体 schema 一律定义在 `packages/shared/src/schemas/`，前后端共用同一份，不在单侧另写类型。
- **不用 ORM**：SQL 只出现在 `apps/api/src/db/queries/*.ts`，路由与中间件不直接写 SQL。
- **统一错误信封**：非 2xx 响应一律为 `{ error: { code, message, details } }`，由 `errorBody()`（`@ukiyo-e/shared`）组装；`server.ts` 的 `setNotFoundHandler` / `setErrorHandler` 兜住 404 与 5xx，路由不要自造格式。
- **鉴权按数据库为准**：会话令牌只携带用户 ID，`requireAuth` 每次回查数据库，所以角色变更即时生效。
- **时间**：一律 ISO-8601 UTC 字符串；DDL 默认值用 `strftime('%Y-%m-%dT%H:%M:%fZ','now')`；`updated_at` 由查询层在 `UPDATE` 时显式写入（无触发器）。
- **安全红线**：密码只以哈希入库、绝不写入日志或响应；令牌不放角色以外的个人信息；`JWT_SECRET` 缺失或过短时进程必须启动失败。
- **注释**：只解释"为什么"，不复述代码在做什么。

## 构建与测试

```bash
npm install
npm run dev        # web :5173 + api :3000（Vite 代理 /api）
npm run typecheck
npm run test
npm run lint
npm run build
```

- 后端测试用 Vitest + `app.inject()`，通过 `buildServer({ databaseUrl: ":memory:" })` 拿到隔离数据库；测试助手在 `apps/api/src/test-support.ts`。
- 测试**不加载 `.env`**，认证配置必须显式传入（`buildTestServer()` 已处理）。
- `buildServer()` 是 async：启动时先校验配置，再迁移数据库、执行管理员引导。
- Playwright 尚未接入（测试栈里预留，见 [note.md](./note.md) 第 1 步）。

## 前端约定

- 样式用 **CSS Modules**，不引入 UI 组件库；开发期保持"功能型"即可，不追求视觉。
- 会话状态只有 `features/auth/useSession()`（TanStack Query 的 `["auth","me"]`）一个来源，其他组件不要另存登录态。
- 网络请求统一走 `api/client.ts` 的 `apiFetch`：它负责 `credentials`、`HttpError`（含 `status`）、以及"只在有请求体时才声明 JSON"。
- 受保护页面用 `RequireAuth` 包裹，不要在各页面里重复写跳转逻辑。

## 部署

- 两个 Dockerfile 的构建上下文都是**仓库根目录**（npm workspaces 需要根 lockfile）。
- 本地 compose 是明文 HTTP，因此必须 `COOKIE_SECURE=false`；上 HTTPS 时改为 `true`。
- 相关变量与默认值见 `docker-compose.yml` 与该文件中的注释。
