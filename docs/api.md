# API 接口文档

> **本文件是接口的单一事实来源（single source of truth）。**
> 接口发生变化时必须在同一次改动里更新本文件——规则与责任范围见仓库根目录 [AGENTS.md](../AGENTS.md)。
> 相关文档：[认证与用户系统设计](./auth-design.md) · [数据库表设计](./database-design.md) · [README](../README.md)

## 1. 基础信息

| 项 | 值 |
| --- | --- |
| 访问入口（开发） | `http://localhost:5173/api`（Vite 代理到 `http://localhost:3000`） |
| 访问入口（Docker） | `http://localhost:8080/api`（nginx 反向代理到 `api:3000`） |
| 访问入口（直连后端） | `http://localhost:3000/api` |
| 协议 | HTTP/1.1；对外部署必须 HTTPS |
| 字符编码 | UTF-8 |
| 请求/响应体 | JSON。**带请求体时必须声明 `Content-Type: application/json`**；无请求体时不要声明（见 §4.4） |
| 认证方式 | 会话 Cookie `ukiyo_session`（JWT，见 §2.1） |
| 时间格式 | ISO-8601 UTC 字符串，如 `2026-10-11T11:18:33.452Z` |
| ID 类型 | 正整数（JSON `number`） |
| 字段命名 | JSON 用 camelCase，数据库列用 snake_case |
| 契约来源 | 请求/响应/错误体 schema 定义在 `packages/shared/src/schemas/`，前后端共用同一份 |

## 2. 通用约定

### 2.1 认证与会话

- 登录/注册成功后服务端下发 `Set-Cookie`，浏览器后续请求自动携带；服务端**不存会话**，每次请求验签后回查数据库。
- 受保护端点缺少或持无效会话 → `401 unauthorized`；已登录但权限不足 → `403 forbidden`。
- 令牌默认有效期 **7 天**（`JWT_TTL` 可配），Cookie 的 `Max-Age` 与之一致。
- **登出只清浏览器 Cookie**：令牌在过期前仍然有效，服务端无法即时吊销（见 [auth-design.md §12.1](./auth-design.md)）。
- 前端需 `credentials: "same-origin"`；若改为跨源部署，必须改为 `"include"` 并同时启用 CORS + `SameSite=None; Secure`。

`Set-Cookie` 属性（由服务端统一下发）：

| 属性 | 值 | 说明 |
| --- | --- | --- |
| 名称 | `ukiyo_session` | |
| `HttpOnly` | `true` | JS 不可读，防 XSS 窃取 |
| `SameSite` | `Lax` | 阻断跨站 POST 携带，缓解 CSRF |
| `Path` | `/` | |
| `Max-Age` | = `JWT_TTL` 秒（默认 `604800`） | |
| `Secure` | `COOKIE_SECURE`，默认仅 `NODE_ENV=production` 时为 `true` | 本地 http 部署必须为 `false`，否则浏览器丢弃 Cookie |

### 2.2 请求参数校验规则

| 字段 | 规则 |
| --- | --- |
| `email` | 合法邮箱；服务端入库前统一 `trim` + 转小写；**大小写不敏感地唯一** |
| `password`（注册） | 长度 8–128 |
| `password`（登录） | 仅要求非空——登录不重复校验强度，避免与 `401` 语义混淆 |
| `displayName` | 可选；`trim` 后 1–50 字符；不传等价于 `null` |

### 2.3 幂等性

| 端点 | 幂等 | 说明 |
| --- | --- | --- |
| `POST /api/auth/logout` | 是 | 未登录调用同样 `204` |
| 其余 `POST` | 否 | `register` 重复邮箱返回 `409` |

### 2.4 分页与过滤

所有返回列表的端点统一使用：

- **查询参数**：`?limit=&offset=`（默认 `limit=20`、`offset=0`，`limit` 上限 `100`）。端点可另加过滤参数（如 `q`）。
- **响应信封**：`{ items: T[], total, limit, offset }`。
  - `total` 是**应用过滤后**的总条数，用于计算页数；
  - `limit` / `offset` 回显**生效值**（含默认值与上限钳制），客户端据此渲染分页控件。

首个采用该约定的端点是 [§4.7 `GET /api/admin/users`](#47-get-apiadminusers)；参数越界返回 `400 validation_error`。

### 2.5 路径与方法

前缀固定为 `/api`。**路径或方法不匹配任何路由时返回 `404 not_found`**（Fastify 的默认行为，不返回 405）。

## 3. 错误码

所有非 2xx 响应使用统一信封：

```json
{
  "error": {
    "code": "validation_error",
    "message": "请求参数不合法",
    "details": [{ "path": "email", "message": "邮箱格式不正确" }]
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `error.code` | string | **受控枚举**，见下表；客户端据此分支，不要匹配 `message` 文案 |
| `error.message` | string | 面向用户的提示（中文），可直接展示 |
| `error.details` | array \| null | 仅 `validation_error` 会带字段级明细 `[{ path, message }]`；其余为 `null` |

错误码总表（枚举定义于 `packages/shared/src/schemas/errors.ts`，**须与本表保持一致**）：

| `code` | HTTP | 含义 | 触发场景 | 客户端建议处理 |
| --- | --- | --- | --- | --- |
| `validation_error` | `400`（Fastify 客户端错误也可能为 `413` / `415`，见下） | 请求本身不合法 | zod 校验失败；JSON 解析失败；声明了 JSON 却发送空 body；请求体超过 1 MiB；`Content-Type` 不受支持 | 展示 `message`，用 `details[].path` 定位字段 |
| `invalid_credentials` | `401` | 邮箱或密码不正确 | 登录时账号不存在**或**密码错误（两者响应完全一致，防账号枚举） | 提示"邮箱或密码不正确"，不要区分原因 |
| `unauthorized` | `401` | 未登录或会话已失效 | 缺少 Cookie、令牌过期/被篡改、令牌指向的用户已不存在 | 清本地状态并跳转登录页 |
| `forbidden` | `403` | 已登录但权限不足 | 非 `admin` 访问管理端点 | 提示无权限；不要重试 |
| `not_found` | `404` | 接口不存在 | 路径未匹配任何路由；或路径存在但方法不匹配 | 检查路径/方法（通常是代码问题，不是运行时错误） |
| `email_taken` | `409` | 邮箱已被注册 | 注册邮箱重复，含 `A@B.com` / `a@b.com` 这类大小写变体 | 提示已注册并引导去登录 |
| `internal_error` | `500` | 服务器内部错误 | 未预期异常、数据库故障等（**真实原因只记服务端日志，不返回**） | 提示稍后重试；不要展示原始信息 |

补充说明：

- **`validation_error` 的状态码不总是 400**：它同时承接 Fastify 自身产生的客户端错误，此时保留 Fastify 的状态码——请求体超限为 `413`、`Content-Type` 不受支持为 `415`。
- **`500` 不会泄漏内部细节**：响应固定为 `{"error":{"code":"internal_error","message":"服务器内部错误","details":null}}`，真实错误对象只写入服务端日志。
- **例外**：nginx/网络层自身产生的错误（如上游不可用 `502`、超时 `504`）不经过本 API，不使用该信封。

## 4. 端点

### 4.1 `GET /api/health`

后端健康检查。鉴权：**不需要**。

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| — | — | — | — | 无参数 |

`200 OK`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | `"ok"` | 固定值 |
| `service` | string | 固定为 `ukiyo-e-api` |
| `time` | string | 服务端当前时间（ISO-8601） |

```jsonc
// 200
{ "status": "ok", "service": "ukiyo-e-api", "time": "2026-10-11T11:18:33.412Z" }
```

### 4.2 `POST /api/auth/register`

注册并**直接登录**（响应即下发会话 Cookie）。鉴权：**不需要**。

请求体：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `email` | string | 是 | 合法邮箱，≤ 254 字符；服务端归一化为小写 |
| `password` | string | 是 | 8–128 字符 |
| `displayName` | string | 否 | `trim` 后 1–50 字符；省略或空字符串按未提供处理 |

```bash
curl -i -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password1234","displayName":"Ukiyo"}'
```

`201 Created` + `Set-Cookie: ukiyo_session=…`

```jsonc
{
  "user": {
    "id": 2,
    "email": "user@example.com",
    "displayName": "Ukiyo",
    "role": "user",
    "pointsBalance": 0,
    "lastLoginAt": null,
    "createdAt": "2026-10-11T11:18:33.452Z"
  }
}
```

| 状态码 | `code` | 场景 |
| --- | --- | --- |
| `201` | — | 创建成功，已登录 |
| `400` | `validation_error` | 邮箱格式错误、密码长度不符等 |
| `409` | `email_taken` | 邮箱已存在（含大小写变体） |

> 注册不会发放积分（`pointsBalance` 恒为 `0`，送积分属路线图第 8 步），也不会写入 `lastLoginAt`。

### 4.3 `POST /api/auth/login`

登录。鉴权：**不需要**。

请求体：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `email` | string | 是 | 合法邮箱 |
| `password` | string | 是 | 非空（不校验长度规则） |

`200 OK` + `Set-Cookie`，响应体与 §4.2 的 `201` 相同（`{ user }`）。

| 状态码 | `code` | 场景 |
| --- | --- | --- |
| `200` | — | 登录成功；同时更新 `lastLoginAt` |
| `400` | `validation_error` | 邮箱格式错误、密码为空 |
| `401` | `invalid_credentials` | 账号不存在或密码错误，**响应体完全一致** |

> 服务端对"邮箱不存在"也执行一次等价的哈希校验，使两条失败路径耗时相近（防时序侧信道）。

### 4.4 `POST /api/auth/logout`

登出。鉴权：**不需要**（幂等）。

- 请求体：**无**。请勿发送 `Content-Type: application/json`——Fastify 会以 `400 validation_error` 拒绝"声明 JSON 却无 body"的请求。前端 `apiFetch` 已按此实现。
- `204 No Content`，响应带清除 Cookie 的 `Set-Cookie`：

```
set-cookie: ukiyo_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
```

| 状态码 | `code` | 场景 |
| --- | --- | --- |
| `204` | — | 无论此前是否有会话，一律返回 `204` |
| `400` | `validation_error` | 错误地声明了 JSON 请求体却没有 body |

> 登出**不吊销令牌**：旧 Cookie 若被留存，在过期前仍可通过 `GET /api/auth/me`。这是无状态方案的已知取舍（[auth-design.md §12.1](./auth-design.md)）。

### 4.5 `GET /api/auth/me`

读取当前登录用户，是前端会话状态的唯一来源。鉴权：**需要**。

`200 OK`：`{ user }`，字段同 §4.2。

| 状态码 | `code` | 场景 |
| --- | --- | --- |
| `200` | — | 返回当前用户 |
| `401` | `unauthorized` | 无 Cookie、令牌无效/过期、用户已被删除 |

### 4.6 `POST /api/admin/users`

管理员创建一个新用户。鉴权：**需要**，且需管理员。

| 请求体 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `email` | string | 是 | 合法邮箱；入库前统一 `trim` + 小写 |
| `password` | string | 是 | 长度 8–128 |
| `displayName` | string | 否 | `trim` 后 1–50 字符；不传等价 `null` |

- 创建出的用户**角色固定为 `user`、积分余额固定为 `0`**——管理员角色只能由环境变量引导产生（见 §5.2）。
- 成功**不下发会话 Cookie**：不影响发起请求的管理员登录态；新用户需自行登录。

`201 Created`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user` | `PublicUser` | 新建用户，字段见 §5.1 |

| 状态码 | `code` | 场景 |
| --- | --- | --- |
| `201` | — | 创建成功 |
| `400` | `validation_error` | 邮箱/密码/展示名不合法（`details` 指明字段） |
| `401` | `unauthorized` | 未登录 |
| `403` | `forbidden` | 已登录但非管理员 |
| `409` | `email_taken` | 邮箱已存在（含大小写变体） |

```jsonc
// 201
{
  "user": {
    "id": 2,
    "email": "new@b.com",
    "displayName": null,
    "role": "user",
    "pointsBalance": 0,
    "lastLoginAt": null,
    "createdAt": "2026-10-11T12:00:00.000Z"
  }
}
```

### 4.7 `GET /api/admin/users`

管理员分页检索用户。鉴权：**需要**，且需管理员。分页约定见 §2.4。

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `limit` | query | int `1–100` | 否 | `20` | 每页条数 |
| `offset` | query | int `≥0` | 否 | `0` | 跳过的条数 |
| `q` | query | string `≤100` | 否 | — | 关键词；`email` 或 `displayName` 的子串匹配（ASCII 大小写不敏感）；`trim` 后空串等价未提供 |

`200 OK`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `items` | `PublicUser[]` | 当前页用户，字段见 §5.1 |
| `total` | number | 过滤后的总条数 |
| `limit` | number | 生效的每页条数 |
| `offset` | number | 生效的偏移量 |

| 状态码 | `code` | 场景 |
| --- | --- | --- |
| `200` | — | 返回列表 |
| `400` | `validation_error` | `limit` / `offset` / `q` 不合法 |
| `401` | `unauthorized` | 未登录 |
| `403` | `forbidden` | 已登录但非管理员 |

```jsonc
// 200
{
  "items": [
    {
      "id": 1,
      "email": "admin@b.com",
      "displayName": null,
      "role": "admin",
      "pointsBalance": 0,
      "lastLoginAt": null,
      "createdAt": "2026-10-11T11:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

## 5. 数据模型

### 5.1 `PublicUser`

对外的用户表示；`password_hash` 永不出现在任何响应中。定义于 `packages/shared/src/schemas/auth.ts`。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | number | 否 | 用户 ID（正整数） |
| `email` | string | 否 | 归一化（小写）后的邮箱 |
| `displayName` | string \| null | 是 | 展示名，未设置时为 `null` |
| `role` | `"user"` \| `"admin"` | 否 | 权限角色，见 §5.2 |
| `pointsBalance` | number | 否 | 积分余额（缓存值，权威账本为积分流水表），注册时为 `0` |
| `lastLoginAt` | string \| null | 是 | 最近登录时间；注册后未登录过为 `null` |
| `createdAt` | string | 否 | 注册时间 |

### 5.2 枚举

| 名称 | 取值 | 说明 |
| --- | --- | --- |
| `role` | `user` / `admin` | `admin` 即管理员；v1 仅由环境变量引导产生（[§9 auth-design](./auth-design.md)），管理端点创建的用户固定为 `user` |
| `error.code` | 见 §3 | 定义于 `packages/shared/src/schemas/errors.ts` |

## 6. 新增受保护端点的实现约定

后端把鉴权做成两个可复用的 `preHandler`（`apps/api/src/auth/middleware.ts`），挂在根实例上，任何路由插件直接使用：

```ts
// 仅需登录
app.get("/auth/me", { preHandler: app.requireAuth }, async (request, reply) => {
  return reply.send({ user: request.user });   // requireAuth 已写入 request.user
});

// 需要管理员（按顺序串联）
app.get(
  "/admin/users",
  { preHandler: [app.requireAuth, app.requireAdmin] },
  async () => ({ items: [] }),
);
```

约定：

- 权限判定**以数据库当前值为准**（令牌只带用户 ID），因此角色变更即时生效、用户被删即时失效。
- 错误响应统一用 `errorBody(code, message, details?)`（来自 `@ukiyo-e/shared`）组装，不要手写信封。
- 请求体用 `packages/shared` 的 zod schema `safeParse` 校验，失败走 §3 的 `validation_error`（`details` 带字段明细）。
- 新增端点后，回到 §4 补充条目，并在 §3 增补可能出现的错误码。

## 7. 本文档的维护规则

1. **接口变化 = 文档变化**：新增/删除端点、改路径或方法、增删改请求或响应字段、增删状态码或错误码、调整校验规则或 Cookie 属性，都必须在**同一次改动**内更新本文件。
2. **错误码三方一致**：`packages/shared/src/schemas/errors.ts` 的枚举、本文件 §3 的表格、以及实际会返回它的代码，三者必须同时更新。
3. **契约改动先改 `packages/shared`**：请求/响应 schema 是前后端共用的唯一来源，不要在单侧另写一份类型。
4. **改完跑一遍**：`npm run typecheck && npm run test`。其中 `apps/api/src/docs.test.ts` 会**自动检查本文档的漂移**——它比对已注册路由与本文档、以及 §3 错误码表格与 `apiErrorCodeSchema` 枚举是否完全一致，漏改会直接测试失败。
