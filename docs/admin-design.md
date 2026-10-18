# 管理员系统设计文档

> 对应开发路线图（见 [note.md](../note.md)）**第 4 步：加入管理员系统，管理员可以创建/查找用户**，以及第 8 步的积分管理。
> 本文档是该步骤的**需求与产物定义**，也是实现前的唯一设计依据。
>
> 前置阅读：[auth-design.md](./auth-design.md)（鉴权中间件、会话形态）、[database-design.md](./database-design.md)（`users` 表与 §7.1 管理员系统扩展）、[api.md](./api.md)（接口契约与错误码单一事实来源）。
>
> **本步骤不新增表、不新增环境变量**：管理员只是 `users.role = 'admin'`，授权入口与错误信封已在第 3 步落地；积分调整复用既有流水表，并新增明确的余额不足错误码。

## 1. 背景与范围

### 1.1 已具备的前置条件

- `users.role`（`'user'` / `'admin'`）已落地，`createUser` 支持显式指定 `role` 与 `pointsBalance`（`apps/api/src/db/queries/users.ts`）。
- `requireAuth` / `requireAdmin` 两个 `preHandler` 已装饰在根实例上（`apps/api/src/auth/middleware.ts`），`requireAdmin` 对非管理员返回 `403 forbidden`——它是本步骤的**唯一授权入口**，本步骤只在其后挂管理端点，不再改鉴权机制。
- 鉴权**以数据库为准**：中间件每次回查用户，因此"刚被设为管理员的人"无需重新登录即可用，"被降权的人"立即失效（[auth-design.md §5.3](./auth-design.md)）。
- 首个管理员由 `ensureAdminFromEnv` 在启动时引导（`apps/api/src/auth/admin-bootstrap.ts`，[auth-design.md §9](./auth-design.md)），因此系统始终存在可登录的管理员，不需要"先有鸡还是先有蛋"的接口。
- `listUsers(db, { limit, offset })` 已提供分页，但**没有搜索/过滤**。
- 前端已有 `react-router-dom` 路由、`useSession()`（会话唯一来源）、`RequireAuth` 与 `apiFetch` 封装（[auth-design.md §7](./auth-design.md)）。

### 1.2 本次范围

严格对齐路线图第 4 步：**管理员创建用户 + 管理员查找（检索/分页）用户**。

| 项 | 内容 |
| --- | --- |
| 后端 | `POST /api/admin/users`（创建用户）、`GET /api/admin/users`（分页 + 关键词检索），两者均挂在 `[requireAuth, requireAdmin]` 之后 |
| 数据层 | 扩展 `listUsers` 支持 `search` 关键词过滤；创建复用既有 `createUser` |
| 共享层 | 新增 `packages/shared/src/schemas/admin.ts`（请求/查询/响应 schema），复用 `auth.ts` 的 `emailSchema` / `passwordSchema` / `publicUserSchema` |
| 前端 | 新增 `/admin/users` 受保护路由（`RequireAuth` + `RequireAdmin`）、用户列表 + 检索 + 创建表单；管理员在主页看到入口 |
| 文档 | 更新 [api.md](./api.md)（§2.4 分页约定、§4 两个端点）、[database-design.md](./database-design.md)（§7.1、§9）、[auth-design.md](./auth-design.md)（§5.2 指向本步骤） |
| 测试 | Vitest：`listUsers` 检索单测、`routes/admin-users.test.ts` 集成测试（`inject`），并把新路由纳入 `docs.test.ts` 的漂移检查 |

### 1.3 不在本次范围（明确不做）

| 不做的事 | 归属 / 理由 |
| --- | --- |
| 修改他人角色（提升/降权） | 路线图第 4 步只要求"创建/查找"；已在本次决策中显式排除（见 §10 D1），角色变更留待后续按需单开 |
| 启用 / 禁用、删除用户 | 路线图未列；删除语义已在 [database-design.md §8 D4/D14](./database-design.md) 记录（有引用则拒绝） |
| 管理用户积分（充值/扣减/查看流水） | 已在本次收尾实现调整接口；流水查询端点暂不开放 |
| 编辑用户资料（改邮箱/展示名/重置密码） | 未列入路线图；需要时另开 |
| `GET /api/admin/users/:id` 单用户详情 | 列表 + 关键词检索已覆盖"查找"；详情端点按需再加 |
| 管理员操作审计日志（`admin_audit_log`） | [database-design.md §7.1](./database-design.md) 的**可选**演进项，本步骤不建表 |
| 管理员专属前端骨架（布局/侧边栏） | 保持"功能型"，单页即可，不引入布局体系 |
| Playwright E2E | 原计划留到后续；本步骤实现时**一并接入**了最小 E2E 套件并覆盖管理流程（见 §8.5） |

### 1.4 本次产物清单（即"最终产物"）

**后端**

- [x] `apps/api/src/routes/admin-users.ts`：`adminUsersRoutes` 插件，注册 `POST /admin/users`、`GET /admin/users`
- [x] `apps/api/src/routes/admin-users.ts`：注册 `PATCH /admin/users/:userId/points`，仅管理员可调整积分
- [x] `apps/api/src/server.ts`：`app.register(adminUsersRoutes, { prefix: "/api" })`
- [x] `apps/api/src/db/queries/users.ts`：`ListUsersOptions` 增加 `search?: string`，`listUsers` 据此过滤（保持向后兼容）

**共享层**

- [x] `packages/shared/src/schemas/admin.ts`：`adminCreateUserRequestSchema`、`adminUserListQuerySchema`、`adminUserListResponseSchema`（及推导类型）
- [x] `packages/shared/src/index.ts`：导出上述 schema

**前端**

- [x] `apps/web/src/features/admin/api.ts`：`createUser`、`listUsers`
- [x] `apps/web/src/features/admin/useUsers.ts`、`useCreateUser.ts`：TanStack Query hooks
- [x] `apps/web/src/features/admin/RequireAdmin.tsx`：非管理员重定向
- [x] `apps/web/src/features/admin/AdminUsersPage.tsx`：检索框 + 结果表格 + 创建表单
- [x] `apps/web/src/features/admin/admin.module.css`：CSS Modules
- [x] `apps/web/src/App.tsx`：新增 `/admin/users` 路由（`RequireAuth` 包裹 `RequireAdmin` 包裹页面）
- [x] `apps/web/src/features/auth/HomePage.tsx`：`role === 'admin'` 时显示"用户管理"入口

**文档**

- [x] [api.md](./api.md)：§4 增补两个端点；§2.4 把"分页约定"从候选改为**已定**（见 §3.4）
- [x] [database-design.md](./database-design.md)：§7.1 状态更新为"已落地"，§9 回填第 7 条
- [x] [auth-design.md](./auth-design.md)：§5.2 注明管理端点已在第 4 步落地
- [x] 本文档「落地步骤」回填

**测试**

- [x] `apps/api/src/db/queries/users.test.ts`：补 `search` 过滤用例
- [x] `apps/api/src/routes/admin-users.test.ts`：401 / 403 / 创建 / 重复邮箱 / 校验失败 / 列表与检索 / 分页边界
- [x] `apps/api/src/docs.test.ts`：注册 `adminUsersRoutes`，使新路由纳入"文档覆盖"检查

**E2E（Playwright，接入时新增）**

- [x] `playwright.config.ts`：自动拉起 api（内存库 + 引导管理员）与 web
- [x] `e2e/admin.spec.ts`：管理员创建/查找用户、普通用户不可见且进不去管理页
- [x] 根 `package.json` 增加 `test:e2e` 脚本；`.gitignore` 忽略 Playwright 产物

## 2. 授权模型

**一句话**：管理端点 = 普通端点加两个 `preHandler`，权限判定完全交给第 3 步已有的 `requireAdmin`，本步骤不新增授权概念。

- 路由一律写成 `{ preHandler: [app.requireAuth, app.requireAdmin] }`（顺序不可颠倒：`requireAdmin` 依赖 `requireAuth` 写入的 `request.user`）。
- 权限判定以数据库当前 `role` 为准，**不做任何缓存**，因此：
  - 被提权者**免登**即可访问；
  - 被降权者手中的旧令牌**立即**失去管理权限。
- 失败语义固定：
  - 未登录 → `401 unauthorized`（`requireAuth` 拦截）；
  - 已登录但非管理员 → `403 forbidden`（`requireAdmin` 拦截，`request.user.role !== 'admin'`）。
- 管理端点前缀 `/api/admin/*`，与 [api.md §6](./api.md) 的示例约定一致。

## 3. 接口契约

所有端点前缀 `/api`，请求与响应体为 `application/json`。完整字段级说明以 [api.md](./api.md) 为**单一事实来源**，本节只记录设计意图与边界。

### 3.1 请求 / 响应 schema（`packages/shared`）

```ts
// packages/shared/src/schemas/admin.ts
import { z } from "zod";
import {
  emailSchema,
  passwordSchema,
  publicUserSchema,
} from "./auth";

// 管理员创建用户：与注册同一套字段规则，但语义是"代为开户"，不是自助注册。
export const adminCreateUserRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, { message: "展示名不能为空" })
    .max(50, { message: "展示名最多 50 字" })
    .optional(),
});

// GET /api/admin/users 的 query：HTTP query 全是字符串，需 z.coerce 转换。
export const adminUserListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  // trim 后空串等价于"未提供"，避免 `?q=` 变成全表扫描匹配。
  q: z
    .string()
    .trim()
    .max(100, { message: "关键词最多 100 字" })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const adminUserListResponseSchema = z.object({
  items: z.array(publicUserSchema),
  total: z.number().int().min(0),
  limit: z.number().int().positive(),
  offset: z.number().int().min(0),
});
```

- 创建响应体**复用** `authResponseSchema`（结构同为 `{ user: PublicUser }`），不另造同义 schema。
- `PublicUser` 由 `toPublicUser(row)` 集中转换，`password_hash` 永不出现在响应中（[auth-design.md §6.1](./auth-design.md)）。

### 3.2 `POST /api/admin/users`

创建一个新用户。鉴权：`[requireAuth, requireAdmin]`。

| 请求体 | 约束 | 说明 |
| --- | --- | --- |
| `email` | 合法邮箱；入库前 `trim` + 小写 | 复用 `emailSchema`，与注册同源 |
| `password` | 长度 8–128 | 复用 `passwordSchema`；**只在服务端哈希后入库** |
| `displayName?` | 可选，`trim` 后 1–50 字符 | 不传等价 `null` |

- 成功：`201` + `{ user: PublicUser }`，**不下发会话 Cookie**（关键差异，见下）。
- `400 validation_error`：zod 校验失败（含 `details`）。
- `401 unauthorized`：无会话。
- `403 forbidden`：非管理员。
- `409 email_taken`：邮箱已存在（含大小写变体）。

设计要点：

1. **创建出的用户角色固定 `'user'`、余额固定 `0`**。理由：本步骤范围不含角色管理（§1.3），若创建时可指定角色，等于**绕过 403 直接铸造管理员**——提权面太大。这与 `registerUser` "公开入口不能造管理员"的安全姿态一致（[auth-design.md §6.2](./auth-design.md)）。
2. **不为新用户建立会话**：端点不调用 `startSession`、不下发 `Set-Cookie`，因此不会覆盖发起请求的管理员自己的会话。新用户需自行登录（或由后续"邀请/重置密码"流程接管，本步骤不做）。
3. **实现复用**：调 `createUser(app.db, { email, passwordHash: await hashPassword(password), displayName, role: "user", pointsBalance: 0 })`；先 `findUserByEmail` 预检 + 捕获 `UNIQUE` 违例兜底竞态，与 `POST /auth/register` 的处理保持一致（`apps/api/src/routes/auth.ts`）。

### 3.3 `GET /api/admin/users`

分页 + 关键词检索用户列表。鉴权：`[requireAuth, requireAdmin]`。

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `limit` | query | int `1–100` | 否 | `20` | 每页条数，上限 100 |
| `offset` | query | int `≥0` | 否 | `0` | 跳过的条数 |
| `q` | query | string `≤100` | 否 | — | 关键词，`trim` 后空串视为未提供 |

- 成功：`200` + `{ items: PublicUser[], total, limit, offset }`。
- `400 validation_error`：`limit` 越界、`offset` 为负、非整数、`q` 超长等（`details` 指明字段 path）。
- `401 unauthorized` / `403 forbidden` 同上。

设计要点：

1. **检索范围 = `email` 或 `display_name`，子串匹配、大小写不敏感（ASCII）**。实现：`WHERE (email LIKE ? ESCAPE '\' OR display_name LIKE ? ESCAPE '\')`，模式串为 `'%' + escaped + '%'`，其中 `escaped` 先转义 `\`→`\\`、`%`→`\%`、`_`→`\_`。转义是必需的：否则用户搜索 `%` 会匹配全表，`_` 会变成任意单字符通配。
2. **`total` 是应用同一过滤条件后的计数**（不是全表 `COUNT(*)`），否则分页控件会算错页数。
3. **响应回显 `limit` / `offset`**：这两个值经过默认值与上限钳制，回显让前端能据此渲染"第 N 页 / 共 M 页"并判断是否还有下一页。这正是 §3.4 把候选约定从 `{ items, total }` 升级为 `{ items, total, limit, offset }` 的原因。
4. **排序固定 `ORDER BY id`**（沿用 `listUsers`），保证分页稳定、结果可复现。

### 3.4 分页与过滤约定（回填 [api.md §2.4](./api.md)）

本端点是**第一个**返回列表的端点，因此在此把 [api.md §2.4](./api.md) 的候选约定定稿，作为后续所有列表端点的统一形态：

- 查询参数：`?limit=&offset=`（可选 `q` 之类的过滤参数按端点定义）。
- 响应信封：`{ items: T[], total: number, limit: number, offset: number }`。
- 约定：`total` 反映**过滤后**的总数；`limit` / `offset` 回显**生效值**（含默认与钳制）。

## 4. 数据层改动

只改一个函数，且保持向后兼容。

### 4.1 `listUsers` 支持关键词

```ts
export interface ListUsersOptions {
  limit?: number;      // 默认 20
  offset?: number;     // 默认 0
  search?: string;     // 新增：按 email / display_name 子串匹配；trim 后空串等价未提供
}
```

- `search` 为空/省略时，SQL 与行为**与现状完全一致**（零条件、全表分页），不破坏既有调用与测试。
- 非空时：拼 `WHERE (email LIKE ? ESCAPE '\' OR display_name LIKE ? ESCAPE '\')`，`items` 与 `total` 使用**同一** `WHERE`。
- LIKE 通配符转义集中放在 `users.ts`（如 `escapeLikePattern` 小工具），保证路由层不需要关心转义细节——延续"SQL 只出现在 `db/queries/*.ts`"的约定（[AGENTS.md](../AGENTS.md)）。
- 已知局限（记录不处理）：SQLite 的 `LIKE` 仅对 ASCII 大小写不敏感；含中/日文展示名时按**精确大小写**匹配子串。demo 可接受。

### 4.2 创建用户

- 直接复用既有 `createUser`（已支持 `role` / `pointsBalance`），管理路由显式传 `role: 'user'`、`pointsBalance: 0`（§3.2 要点 1）。
- `createUser` 内部已做 `normalizeEmail`（小写 + trim），路由无需重复。

## 5. 前端设计

### 5.1 路由

在 [App.tsx](../apps/web/src/App.tsx) 现有三条路由基础上新增一条：

| 路径 | 元素 | 权限 |
| --- | --- | --- |
| `/admin/users` | `<RequireAuth><RequireAdmin><AdminUsersPage /></RequireAdmin></RequireAuth>` | 管理员 |

### 5.2 `RequireAdmin`

- 复用 `useSession()`（会话唯一来源，[auth-design.md §7.2](./auth-design.md)），不另存登录态。
- `isLoading` → 占位"加载中…"；`user.role !== 'admin'` → `<Navigate to="/" replace />`（不暴露管理页存在性）。
- 与后端 `requireAdmin` 是**双保险**：前端只管体验，真正的授权判定永远在后端。

### 5.3 目录与文件

```
apps/web/src/features/admin/
├── api.ts             # createUser / listUsers（走 apiFetch）
├── useUsers.ts        # TanStack Query：["admin","users",{limit,offset,q}]
├── useCreateUser.ts   # useMutation；成功后 invalidate ["admin","users"]
├── RequireAdmin.tsx
├── AdminUsersPage.tsx # 检索 + 分页 + 表格 + 创建表单
└── admin.module.css
```

- 网络请求统一走 `api/client.ts` 的 `apiFetch`；错误展示统一用 `errorMessage()`；分支判断用 `HttpError.status` / `body.error.code`，不匹配中文文案。
- 创建成功后调用 `queryClient.invalidateQueries({ queryKey: ["admin", "users"] })` 刷新列表。
- 检索用受控输入 + 防抖后写入 query key（demo 也可"提交才查"，二选一，实现时定）。

### 5.4 入口

[HomePage.tsx](../apps/web/src/features/auth/HomePage.tsx) 的 `actions` 区增加一个链接：仅当 `user.role === 'admin'` 时渲染 `<Link to="/admin/users">用户管理</Link>`。

## 6. 配置项

**无新增环境变量**。`ADMIN_EMAIL` / `ADMIN_PASSWORD`（首个管理员引导）已在第 3 步落地，见 [auth-design.md §8、§9](./auth-design.md)。

## 7. 错误码

**不新增错误码**，`.env` 与 `packages/shared/src/schemas/errors.ts` 均不改动。本步骤用到的既有码：

| `code` | HTTP | 触发场景（本步骤） |
| --- | --- | --- |
| `validation_error` | `400` | 创建体或列表 query 校验失败 |
| `unauthorized` | `401` | 无会话访问管理端点 |
| `forbidden` | `403` | 非管理员访问管理端点 |
| `email_taken` | `409` | 创建时邮箱已存在（含大小写变体） |

> 因无新增错误码，[api.md §3](./api.md) 表格保持不变；但 [api.md §4](./api.md) 必须补齐两个端点条目，否则 `apps/api/src/docs.test.ts` 的"文档覆盖"用例会失败。

## 8. 测试计划（Vitest）

### 8.1 查询层 `apps/api/src/db/queries/users.test.ts`（补用例）

- `search` 命中 `email`（子串）与 `display_name`（子串）；
- `search` 大小写不敏感（ASCII）；
- `search` 中的 `%` / `_` 被当作**字面量**（如插入 `a_b@x.com`，用 `q = "a_b"` 只命中它，不用 `q = "axb"` 命中）；
- `total` 反映过滤后的数量；`search` + `limit/offset` 组合分页正确；
- 省略 `search` 时行为与既有用例一致（回归）。

### 8.2 路由层 `apps/api/src/routes/admin-users.test.ts`（新增）

用 `buildTestServer()` + `app.inject()`，通过 `createUser(..., { role: 'admin' })` + `signSessionToken` 造管理员/普通用户会话（范式见 `auth/middleware.test.ts`）。

- 鉴权：无 Cookie → `401`；普通用户 → `403`；管理员 → 放行；
- 创建：`201` 返回 `{ user }`、`role === 'user'`、`pointsBalance === 0`、响应**不含** `password_hash`、**不含** `Set-Cookie`；新用户随后可经 `POST /auth/login` 登录成功；
- 创建冲突：重复邮箱（含 `A@B.com` vs `a@b.com`）→ `409 email_taken`；
- 创建校验：短密码 / 非法邮箱 / 超长展示名 → `400`（`details` 含字段 path）；
- 列表：默认分页返回 `{ items, total, limit, offset }`；`q` 过滤生效；`limit=101` / `offset=-1` / `limit=abc` → `400`；`?q=` 空串等价未过滤。

### 8.3 文档漂移 `apps/api/src/docs.test.ts`

在 `registeredRoutes()` 中追加 `app.register(adminUsersRoutes, { prefix: "/api" })`，使 `POST /api/admin/users`、`GET /api/admin/users` 进入"已注册路由 ⊆ api.md"的检查。

### 8.4 执行

```bash
npm run typecheck && npm run test && npm run lint
```

### 8.5 E2E（Playwright）

`e2e/admin.spec.ts` 覆盖两条主线，验证"前端能否真正跑通管理流程"：

1. **管理员创建并查找用户**：登录 → 主页出现"用户管理"入口 → 创建用户 → 成功提示 → 关键词检索命中该用户。
2. **普通用户隔离**：经注册页登录 → 主页**无**管理入口 → 直接访问 `/admin/users` 被重定向回 `/`。

运行方式：`npm run test:e2e`（首次需 `npx playwright install chromium`）。配置见 `playwright.config.ts`：自动拉起后端与前端，后端用 `:memory:` 内存库与确定性的 `ADMIN_EMAIL`/`ADMIN_PASSWORD`，因此测试不依赖本地 `.env`。注意 Vite dev 监听 IPv6 `[::1]`，前端 URL 用 `localhost`、后端 URL 用 `127.0.0.1`。

同一套用例也可对准 **Docker 部署**：`docker compose up --build -d` 后运行 `npm run test:e2e:docker`（`playwright.docker.config.ts` 不启动服务，直接打 nginx :8080；端点可用 `E2E_BASE_URL` 覆盖）。

## 9. 安全考量

| 议题 | 结论 |
| --- | --- |
| 越权（水平/垂直） | 垂直：所有管理端点都经 `requireAdmin`（数据库实时判定）；水平：本步骤无"操作他人资源"的接口（只有创建与只读列表），暂不涉及 |
| 提权面 | 创建用户**强制 `role='user'`、余额 `0`**，管理端无法铸造管理员（§3.2） |
| 会话污染 | 创建端点不下发 `Set-Cookie`，不会顶掉管理员会话（§3.2） |
| 密码处理 | 只在服务端 `hashPassword` 后入库；不出现在响应/日志（[auth-design.md §12.6](./auth-design.md)） |
| SQL 注入 | 全部走 `node:sqlite` 参数化占位符；LIKE 通配符额外转义（§3.3） |
| 检索放大 | `limit` 硬上限 100、`q` 上限 100 字符，避免管理员接口被用作大范围扫描/DoS |
| 枚举 | 管理端本就有权查看用户，不适用面向匿名用户的防枚举措施；`409` 语义对管理员无害 |
| 审计 | **已知局限**：本步骤不记录"谁创建了谁"。若需要，按 [database-design.md §7.1](./database-design.md) 增加 `admin_audit_log` 再回填 |

## 10. 决策记录

| 编号 | 事项 | 倾向 | 状态 |
| --- | --- | --- | --- |
| D1 | 本步骤范围 | 仅"创建 + 查找/分页"，**不含改角色/删除/禁用/积分**（改角色=提权面，单开更安全） | ✅ 已定（用户确认） |
| D2 | 创建出的用户角色 | 固定 `'user'`，余额固定 `0`；创建期不可指定角色 | ✅ 已定 |
| D3 | 创建后是否自动登录新用户 | 否；不下发会话 Cookie，避免覆盖管理员会话 | ✅ 已定 |
| D4 | "查找"的形态 | 列表端点 + `q` 关键词（email/display_name 子串），暂不加 `/:id` 详情端点 | ✅ 已定 |
| D5 | 列表响应信封 | `{ items, total, limit, offset }`（回显钳制后的 limit/offset） | ✅ 已定 |
| D6 | 检索实现 | `LIKE … ESCAPE '\'` 子串匹配 + 通配符转义；ASCII 大小写不敏感 | ✅ 已定 |
| D7 | 分页上限 | `limit` 默认 20、上限 100；`offset ≥ 0` | ✅ 已定 |
| D8 | 是否新增错误码/表/环境变量 | 均否，全部复用第 3 步成果 | ✅ 已定 |

## 11. 落地步骤

实现按"契约 → 数据层 → 路由 → 文档 → 前端 → 测试"推进，每步可独立验证：

1. ✅ `packages/shared`：新增 `schemas/admin.ts` 并在 `index.ts` 导出（§3.1）。
2. ✅ 数据层：`db/queries/users.ts` 的 `ListUsersOptions` 增加 `search`，实现过滤与转义；补单测（§4、§8.1）。
3. ✅ 路由：新增 `apps/api/src/routes/admin-users.ts`（并抽出 `routes/helpers.ts` 复用校验/唯一冲突处理），在 `server.ts` 注册；补 `routes/admin-users.test.ts`（§3.2、§3.3、§8.2）。
4. ✅ 文档：更新 [api.md](./api.md) §2.4 与 §4；更新 [database-design.md](./database-design.md) §7.1/§9 与 [auth-design.md](./auth-design.md) §5.2；在 `docs.test.ts` 注册新路由（§7、§8.3）。
5. ✅ 前端：`features/admin/*` 四件套 + `App.tsx` 路由 + `HomePage.tsx` 入口（§5）。
6. ✅ 收尾：`npm run typecheck && npm run test && npm run lint` 全绿（14 文件 / 149 用例）；`npm run build` 通过；接入 Playwright E2E 并 `npm run test:e2e` 通过（2 用例）；另做了一次真实服务的端到端冒烟（401 / 权限 / 创建 / 409 / 检索 / 分页校验 / 登录）。

> 每一步完成后勾选 §1.4 对应的复选框。
