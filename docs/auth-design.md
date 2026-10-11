# 认证与用户系统设计文档

> 对应开发路线图（见 `note.md`）**第 3 步：初步实现用户系统，包括注册、登陆和验证功能**。
> 本文档是该步骤的**需求与产物定义**，也是实现前的唯一设计依据；表结构沿用 [database-design.md](./database-design.md)（本次**不新增表**）。

## 1. 背景与范围

### 1.1 已具备的前置条件

- `users` 表已落地（`apps/api/src/db/migrations/0002_users.sql`），含 `email`（UNIQUE）、`password_hash`、`role`（`user` / `admin`）、`points_balance`、`last_login_at`。
- `apps/api/src/db/queries/users.ts` 已有 `registerUser` / `createUser` / `findUserByEmail` / `findUserById` / `listUsers`，其中 `normalizeEmail` 统一做小写 + trim。
- Fastify 实例与 `app.db` 装饰器、`app.inject()` 测试范式已就绪（见 `apps/api/src/server.ts`、`apps/api/src/routes/health.test.ts`）。
- 部署为同源：开发期 Vite 代理 `/api`，生产 nginx 反代 `/api`（见 `apps/web/vite.config.ts`、`apps/web/nginx.conf`），**无跨域**。

### 1.2 本次范围

| 项 | 内容 |
| --- | --- |
| 后端 | 注册、登录、登出、查询当前用户 4 个端点；`requireAuth` / `requireAdmin` 鉴权中间件；首个管理员的引导 |
| 共享层 | `packages/shared` 的认证请求/响应 zod schema 与类型 |
| 前端 | React Router 路由；注册页、登录页、主页；会话 hooks 与受保护路由 |
| 配置 | 新增环境变量、`docker-compose.yml` 透传、README 更新 |
| 测试 | Vitest：密码、令牌、鉴权中间件、路由 `inject` 集成测试 |

### 1.3 不在本次范围（明确不做）

| 不做的事 | 归属 / 理由 |
| --- | --- |
| 邮箱验证 / 激活链接 | 本地 demo 需接邮件服务，成本高；v1 接受 |
| 忘记密码、修改密码 | 未列入路线图，需求未提出 |
| 账号禁用 / 删除的权限语义 | 路线图第 4 步（管理员系统） |
| 管理员管理用户/积分的界面 | 路线图第 4、8 步 |
| 注册发放积分（`signup_bonus`） | 路线图第 8 步；本次注册余额固定 `0` |
| 令牌刷新（refresh token） | 见 §12「会话吊销」的演进路径 |
| 登录速率限制 | 见 §12「暴力破解与资源耗尽」，本次记录风险与接入位置 |
| Playwright E2E | 本次仅 Vitest（已确认），E2E 留到后续 |

### 1.4 本次产物清单

- [x] `packages/shared/src/schemas/auth.ts`（含 `errorBody()` 组装助手，+ `index.ts` 导出）
- [x] `apps/api/src/auth/`：`config.ts`、`password.ts`、`token.ts`、`cookie.ts`、`public-user.ts`、`middleware.ts`、`admin-bootstrap.ts`
- [x] `apps/api/src/routes/auth.ts`（`server.ts` 注册 `@fastify/cookie`、挂载装饰器与管理员引导，`buildServer` 改为 async）
- [x] `apps/api/src/db/queries/users.ts` 增补 `updateUserLastLogin` / `updateUserRole`
- [x] `apps/web`：React Router 路由 + `features/auth/*` + 登录/注册/主页组件 + CSS Modules
- [x] `.env.example`、`docker-compose.yml`、`README.md` 更新
- [x] 测试：`auth/config.test.ts`、`auth/password.test.ts`、`auth/token.test.ts`、`auth/middleware.test.ts`、`routes/auth.test.ts`、`server.test.ts`，以及 `test-support.ts` 测试助手
- [x] 本文档「落地步骤」已回填
- [x] 接口契约文档 [api.md](./api.md)（含错误码总表），并由 [AGENTS.md](../AGENTS.md) 规定接口变化时必须同步

## 2. 总体方案与会话形态

**一句话**：登录态 = 一枚 HS256 签名的 JWT，放在 `httpOnly` Cookie 里；服务端不存会话，鉴权时验签并**回查数据库取用户**。

### 2.1 为什么是 httpOnly Cookie + 无状态 JWT

| 方案 | 取舍 | 结论 |
| --- | --- | --- |
| **httpOnly Cookie + 无状态 JWT** | 不加表、`httpOnly` 天然防 JS 读取、同源部署无 CORS 负担；代价是**无法服务端即时吊销** | ✅ 采用 |
| httpOnly Cookie + 服务端 session 表 | 可即时吊销、可统计在线；代价是新增表 + 每次请求一次查表 + 清理策略 | ⬜ 见 §12 演进路径 |
| Bearer Token 存 `localStorage` | 实现最直白；但任何 XSS 都能读取令牌，安全性最低 | ❌ 不采用 |

### 2.2 请求鉴权链路

```
浏览器 ──(Cookie: ukiyo_session=<JWT>)──> Fastify
  1. @fastify/cookie 解析出令牌             ── 无令牌 → 401
  2. jose 验签（强制 HS256，校验 exp）      ── 签名/过期失败 → 401
  3. 取 payload.sub → findUserById(db, id)  ── 用户不存在 → 401
  4. request.user = toPublicUser(row)（剥离 password_hash）
  5. requireAuth 放行；requireAdmin 再校验 role
```

第 3 步的**回查数据库**是关键设计：令牌里**不携带 `role`**，权限一律以数据库当前值为准。收益是管理员改角色立刻生效，不存在「令牌里的旧角色」这一隐性权限来源（见 §5.3）。

## 3. 密码存储：`scrypt`

### 3.1 存储格式

`password_hash` 列存**自描述**字符串，算法与参数全部内联，便于将来调参而不影响存量用户：

```
scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
例：scrypt$16384$8$1$yN0m...$Q2xr...
```

### 3.2 参数

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| 算法 | `scrypt`（`node:crypto`） | 内存硬哈希，Node 内置、零依赖 |
| `N`（cost） | `16384`（2¹⁴） | 约 16 MiB 内存 / 次，典型硬件约 50–100 ms |
| `r` | `8` | 块大小 |
| `p` | `1` | 并行度 |
| `salt` | 16 字节随机（`randomBytes`） | **每个用户独立**，同一密码入库结果必然不同 |
| `keylen` | `64` 字节 | 派生密钥长度 |
| `maxmem` | `64 * 1024 * 1024` | **必须显式设置**：Node 默认上限 32 MiB，`N=16384, r=8` 需 16 MiB 尚可，但一旦上调 `N` 就会抛 `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` |

### 3.3 实现要点

- 用**异步** `crypto.scrypt`（`promisify`），不用 `scryptSync`：同步版本会阻塞事件循环，哈希耗时上百毫秒，足以拖垮并发。
- 校验时从存储字符串**解析参数**后重算，再以 `crypto.timingSafeEqual` 比较（**不可用 `===`**，长度不等时先返回 false 以避免 `timingSafeEqual` 抛错）。
- 解析失败（格式损坏、算法前缀不认识）视为校验失败，返回 `false` 而非抛异常。
- 参数常量集中在 `password.ts` 顶部，作为格式 v1 的默认值。

### 3.4 为什么不选用 `argon2`

已实测确认 `argon2@0.45.x` 自带 `linux-x64-musl` 与 `darwin-arm64` 预编译产物，Alpine 镜像**无需**编译工具链，即"部署风险"其实已被排除。最终仍选择 `scrypt`：

- 密码哈希是**内部自有格式**，无跨实现互操作要求，自研风险可控（对比 §4.4 的 JWT）。
- 不引入**原生模块**（N-API 二进制），消除"预编译产物与目标平台不匹配时回退到源码编译"这一类环境风险，也让 CI/多架构构建更省心。
- 两者安全性同级（均为内存硬算法）。

并发内存代价需留意：`16 MiB × 并发哈希数`。登录/注册由用户触发、频率低，v1 可接受（与 §12「暴力破解」风险同源）。

## 4. 会话令牌：JWT（`jose`）

### 4.1 令牌内容

```jsonc
{ "sub": "42", "iat": 1791800000, "exp": 1792404800 }   // 仅用户 ID + 时间戳
```

- `sub` 用**字符串**（JWT 规范要求，`jose` 亦校验）；读取时转回 `number`。
- **不放 `role`**：见 §2.2 / §5.3。
- **不放邮箱等个人信息**：Cookie 虽 `httpOnly`，但载荷是 base64 可读的。

### 4.2 签名与校验

```ts
// 签发
await new SignJWT({ sub: String(user.id) })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime(JWT_TTL)      // 默认 "7d"
  .sign(secret);

// 校验：algorithms 白名单是必需项
await jwtVerify(token, secret, { algorithms: ["HS256"] });
```

- **必须显式传 `algorithms: ["HS256"]`**：这是挡住 `alg: none` 与算法混淆攻击的关键一步，不能依赖库的默认宽松行为。
- 令牌无效/过期/签名不符，一律抛错 → 中间件转 `401`，**不向客户端区分具体原因**。

### 4.3 密钥管理

- 密钥来自 `JWT_SECRET`：**长度不足 32 字符或缺失时，进程启动即失败**，绝不静默回退到硬编码默认值（否则任何人都能伪造令牌）。
- `.env.example` 提供一个本地开发用示例值；`docker-compose.yml` 透传该变量并在注释里写明生产必须替换。
- 轮换能力：`jose` 支持 `kid` + 多密钥校验。v1 不做，但结构上不需要改动（见 §12）。

### 4.4 为什么用 `jose` 而不是自实现 HS256

JWT 是**跨实现的公开格式**，自实现校验需要同时正确处理：拒绝 `alg: none` 与非 HS256、`timingSafeEqual`、`exp`/`nbf`/`iat`、时钟偏移容差、base64url 编解码。漏任一条即为**认证绕过漏洞**，且这类错误"读代码看不出来"——与项目"降低阅读代码的理解难度"的取向正好相反。

`jose` 为**纯 ESM、纯 JS、零依赖**（已核实），成本仅"多信任一个包"，且天然支持后续密钥轮换与算法升级。

## 5. 鉴权中间件

### 5.1 `requireAuth`

- 无 Cookie / 验签失败 / 用户不存在 → `401 { error: { code: "unauthorized" } }`。
- 通过 → 写入 `request.user`（`PublicUser`，**绝不含 `password_hash`**）。

### 5.2 `requireAdmin`

- 依赖 `requireAuth` 先执行；`request.user.role !== "admin"` → `403 { error: { code: "forbidden" } }`。
- 这是路线图第 4 步管理员系统的**唯一授权入口**，本次先落地机制，管理端点留给第 4 步。

### 5.3 鉴权以数据库为准

中间件每次都 `findUserById`（主键查询，代价可忽略）。由此得到两条明确语义：

- **角色变更立即生效**：管理员刚把某人设为 `admin`，其手中令牌无需重新登录即可用；被降权同样立即失效。
- **用户被删除即失效**：令牌仍验签通过，但用户查不到 → `401`。
- **唯一无法即时生效的是"主动登出"**：无状态令牌在 `exp` 之前始终有效（见 §12）。

## 6. 接口契约

所有端点前缀 `/api`，请求与响应体统一 `application/json`。三个返回用户的端点结构**统一为 `{ user: PublicUser }`**，前端可复用同一解析逻辑。

### 6.1 `PublicUser`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 用户 ID |
| `email` | string | 归一化（小写）后的邮箱 |
| `displayName` | string \| null | 展示名 |
| `role` | `"user"` \| `"admin"` | 角色 |
| `pointsBalance` | number | 积分余额（缓存值，权威见流水表） |
| `lastLoginAt` | string \| null | 最近登录时间（ISO-8601） |
| `createdAt` | string | 注册时间（ISO-8601） |

> `password_hash` 永不出现在任何响应中；`PublicUser` 由 `toPublicUser(row)` 集中转换（列名 snake_case → JSON camelCase），避免各路由各自拼装。

### 6.2 `POST /api/auth/register`

| 请求体 | 约束 |
| --- | --- |
| `email` | 合法邮箱；入库前 `trim + 小写`（复用 `normalizeEmail` 语义） |
| `password` | 长度 8–128（下限为强度要求，上限防超大输入拖垮哈希） |
| `displayName?` | 可选，长度上限 50 |

- 成功：`201` + `Set-Cookie: ukiyo_session=<JWT>` + `{ user }`（**注册即登录**，无需再跳登录页）。
- `400` `validation_error`：zod 校验失败（含 `details`）。
- `409` `email_taken`：邮箱已存在（含大小写变体）。

### 6.3 `POST /api/auth/login`

- 请求体：`email`、`password`（同一套 schema 的登录变体）。
- 成功：`200` + `Set-Cookie` + `{ user }`；同时更新 `last_login_at`。
- `401` `invalid_credentials`：**统一文案，不区分"邮箱不存在"与"密码错误"**，避免账号枚举。
- 实现细节：邮箱不存在时也执行一次**假哈希校验**（对固定 dummy 哈希调用 `verifyPassword`），使两条路径耗时相近，堵住时序侧信道。

### 6.4 `POST /api/auth/logout`

- 无需请求体；`204`，响应带清除 Cookie 的 `Set-Cookie`（同名、`Max-Age=0`）。
- **幂等**：未登录调用同样返回 `204`。

### 6.5 `GET /api/auth/me`

- 鉴权：`requireAuth`。
- 成功：`200 { user }`；未登录：`401 unauthorized`。
- 前端把它当作"当前会话来源"（见 §7.2）。

### 6.6 错误体统一格式

```jsonc
{ "error": { "code": "email_taken", "message": "该邮箱已被注册", "details": null } }
```

- `code` 为**受控枚举**，前端据 `code` 分支而不匹配中文文案；枚举定义在 `packages/shared/src/schemas/errors.ts`。
- 本文档**不再重复维护错误码清单**——完整目录（含状态码、触发场景、客户端处理建议）见 [api.md §3](./api.md)，改动时以那里为单一事实来源。
- 该信封适用于**所有**非 2xx 响应：路由返回的 4xx、Fastify 自身产生的客户端错误（经 `server.ts` 的 `setErrorHandler`）、以及未匹配路由的 404（`setNotFoundHandler`）。

### 6.7 Cookie 参数

| 属性 | 值 | 说明 |
| --- | --- | --- |
| 名称 | `ukiyo_session` | |
| `HttpOnly` | `true` | 禁止 JS 读取，XSS 无法窃取令牌 |
| `SameSite` | `Lax` | 阻断跨站 `POST` 携带 Cookie → 缓解 CSRF（见 §12） |
| `Secure` | 由 `COOKIE_SECURE` 决定，默认「`NODE_ENV === "production"`」 | 本地 http（5173/8080）必须为 `false`，生产 HTTPS 必须为 `true` |
| `Path` | `/` | 使 `/api/*` 与前端同源请求均可携带 |
| `Max-Age` | 与 `JWT_TTL` 一致（默认 7 天） | 二者不一致会造成"Cookie 还在但令牌已过期"的迷惑现象，故实现中由**同一常量**派生 |
| `Domain` | 不设置 | 主机级 Cookie，同源部署足够 |

## 7. 前端设计

### 7.1 路由

引入 `react-router-dom`，本次先做三条路由：

| 路径 | 页面 | 访问控制 |
| --- | --- | --- |
| `/login` | 登录页 | 公开 |
| `/register` | 注册页 | 公开 |
| `/` | 主页（显示 email、角色、积分余额 + 登出按钮） | **需登录** |

- 未登录访问受保护路由 → 重定向 `/login?redirect=<原路径>`，登录成功后回跳。
- 已登录访问 `/login` / `/register` → 重定向 `/`（避免重复登录）。

### 7.2 会话状态

- 单一数据源：TanStack Query 的 `["auth", "me"]` → `GET /api/auth/me`。
- `401` 视为"未登录"（`queryFn` 内捕获，返回 `null`），**不重试、不报错弹窗**——未登录是正常状态而非异常。
- 登录/注册/登出 mutation 成功后 `invalidateQueries(["auth","me"])`，由 query 重新拉取，避免手写状态同步。

### 7.3 目录与文件

```
apps/web/src/
├── api/client.ts              # 增强：抛带 status 的 HttpError，credentials: "same-origin"
├── App.tsx                    # BrowserRouter + 路由表（QueryClientProvider 仍在 main.tsx）
└── features/auth/
    ├── api.ts                 # register/login/logout/me 的 fetch 封装
    ├── useSession.ts          # 当前用户（query）
    ├── useLogin.ts / useRegister.ts / useLogout.ts
    ├── RequireAuth.tsx        # 受保护路由包装
    ├── LoginPage.tsx / RegisterPage.tsx / HomePage.tsx
    └── *.module.css           # CSS Modules，沿用 index.css 的配色变量
```

### 7.4 现有 `api/client.ts` 的三点增强

- 抛错时携带 HTTP `status`（新增 `HttpError` 类）并提供 `errorMessage()`，否则前端无法区分 `401`（未登录）与 `409`（邮箱已存在），也无从取用后端文案。
- 显式 `credentials: "same-origin"`。若将来 `VITE_API_BASE` 指向**跨源**地址，必须改为 `"include"` 并在后端启用 CORS + `SameSite=None; Secure`——本次同源部署不涉及，记录以免踩坑。
- **只在真的有请求体时才设 `Content-Type: application/json`**，且 204 响应先把空 body 读掉再返回。两个都是实测踩到的坑：Fastify 会以 `400` 拒绝"声明 JSON 却没有 body"的请求（无 body 的 `POST /auth/logout` 即如此），而 204 后立刻前端跳转会让浏览器把请求记为 `ERR_ABORTED`（服务端其实已正常完成）。

## 8. 配置项

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `JWT_SECRET` | **是** | 无 | HS256 密钥，长度 ≥ 32；缺失或过短 → **启动失败** |
| `JWT_TTL` | 否 | `7d` | `jose` 接受的时间表达式（如 `12h`、`7d`） |
| `ADMIN_EMAIL` | 否 | 无 | 引导管理员邮箱；未设置则跳过引导 |
| `ADMIN_PASSWORD` | 否 | 无 | 引导管理员密码；**仅在该邮箱尚不存在时**用于创建 |
| `COOKIE_SECURE` | 否 | 生产 `true` / 开发 `false` | 强制覆盖 Cookie 的 `Secure` 属性 |

以上均写入 `.env.example` 并在 `docker-compose.yml` 的 `api` 服务中透传。

## 9. 首个管理员的引导

`ensureAdminFromEnv(db)` 在 `buildServer()` 中、迁移之后执行，**幂等**，规则明确如下：

| `ADMIN_EMAIL` | 邮箱是否已存在 | 行为 |
| --- | --- | --- |
| 未设置 | — | 跳过（记一条 info 日志） |
| 已设置，且提供 `ADMIN_PASSWORD` | 否 | 用 `createUser` 创建，`role='admin'`，密码经 `hashPassword` |
| 已设置，且提供 `ADMIN_PASSWORD` | 是 | **仅**确保 `role='admin'`，**不覆盖密码** |
| 已设置，未提供 `ADMIN_PASSWORD` | 是 | 仅提升 `role='admin'` |
| 已设置，未提供 `ADMIN_PASSWORD` | 否 | 无法创建（无密码）→ 记 **warn** 日志并跳过，不抛出 |

三条硬性约束：

- **不覆盖已存在账号的密码**：环境变量是长期存在的配置，若每次启动都重置密码，会悄悄冲掉用户自行修改的密码，属于"配置即后门"的隐患。
- **不走注册路径**：引导直接调用 `createUser`（允许指定 `role`），因为 `registerUser` 会把角色固定为 `user`（见 database-design §3.3）。
- `ADMIN_PASSWORD` 也受注册同样的长度下限约束（≥ 8）：过短的密码会记 warn 日志并跳过创建，而不是引导出一个弱口令管理员。

## 10. 数据层改动

**不新增表、不新增迁移。** 仅补齐两个既有需求所需的最小写入函数（放 `apps/api/src/db/queries/users.ts`，风格与既有函数一致）：

| 函数 | 作用 |
| --- | --- |
| `updateUserLastLogin(db, id, at?)` | 登录成功时写 `last_login_at`（同时更新 `updated_at`） |
| `updateUserRole(db, id, role)` | 管理员引导提升角色；第 4 步管理功能也复用 |

- 二者都返回更新后的 `UserRow`（或 `undefined`），并在 `UPDATE` 时**显式写 `updated_at`**——与 database-design §2「`updated_at` 由查询层显式维护」的既有约定一致；该文 §8 的 D7 因此可以收敛为「已定：查询层显式写入」，**实现时同步回填那一行**。
- `toPublicUser` 放在 `apps/api/src/auth/public-user.ts`：它是**对外表示层**的转换，不属数据库职责，避免 `queries/` 目录混入 HTTP 契约。

## 11. 测试计划（Vitest）

| 文件 | 覆盖点 |
| --- | --- |
| `apps/api/src/auth/config.test.ts` | 时长解析（`45s`/`30m`/`12h`/`7d`/裸数字）与非法值抛错；`JWT_SECRET` 缺失或过短抛错；`COOKIE_SECURE` / `NODE_ENV` 对 `Secure` 的影响 |
| `apps/api/src/auth/password.test.ts` | 哈希格式符合 `scrypt$N$r$p$salt$hash`；正确密码通过、错误密码拒绝；同一密码两次哈希**结果不同**（salt 随机）；损坏/陌生前缀的哈希返回 `false` 而非抛错 |
| `apps/api/src/auth/token.test.ts` | 签发→校验往返；载荷只含 `sub`/`iat`/`exp`；过期令牌被拒；**篡改载荷/签名**被拒；**换密钥**被拒；`alg: none` / `HS512` 被拒（`algorithms` 白名单生效） |
| `apps/api/src/auth/middleware.test.ts` | 无 Cookie → 401；坏令牌 → 401；用户不存在 → 401；正常 → 放行且不泄漏 `password_hash`；角色变更无需换令牌即时生效；`requireAdmin`：普通用户 403、管理员放行、无会话时优先 401 |
| `apps/api/src/routes/auth.test.ts` | 注册 201 + Cookie 属性（`HttpOnly`/`SameSite=Lax`/`Max-Age`/无 `Secure`）+ 返回用户；重复邮箱（含大小写变体）→ 409；非法/缺失请求体 → 400；登录成功 200 并写入 `last_login_at`；登录失败 401 且**未知邮箱与错误密码响应完全一致**；`GET /me` 未登录 401、已登录返回同一用户、篡改 Cookie 401；登出 204 + 清 Cookie + 幂等，且**旧令牌仍可用**（固化 §12.1 的取舍）；管理员引导：创建 / 提升但不重置密码 / 缺密码或过短时跳过 / 未设置则不做任何事 |
| `apps/api/src/server.test.ts` | `JWT_SECRET` 不可用时 `buildServer` 直接拒绝启动 |
| 既有测试 | `health.test.ts` 改为 `await buildServer()` 并显式传入认证配置；查询层测试保持不变 |

- 全部路由测试沿用 `buildServer({ databaseUrl: ":memory:" })` + `app.inject()`，通过 `response.cookies` / `inject` 的 `cookies` 选项传递会话 Cookie，不启动真实端口。
- 环境变量在测试中通过 `vi.stubEnv` 注入，避免依赖开发者本机 `.env`。

## 12. 安全考量与已知风险

### 12.1 会话吊销（**已知局限**）

无状态令牌在 `exp` 之前无法被服务端废除，因此「登出」只清浏览器 Cookie；若令牌已被窃取，7 天内仍可用。

- 缓解：TTL 可配置（见 §8 配置项），按需调短。
- 演进路径（成本从低到高）：
  1. **令牌版本号**：`users` 加 `token_version INTEGER`，令牌带 `tv`，中间件比对不符即 401。可覆盖"登出全部设备""改密后失效"，**不需要会话表**（改角色已由 §5.3 的实时回查覆盖）。
  2. **会话表**：需要真正的在线设备列表/精细吊销时再引入。

### 12.2 CSRF

Cookie 认证天然引入 CSRF 面。本次靠 `SameSite=Lax` 缓解：跨站**非顶层导航**的请求不会携带该 Cookie，而所有状态变更端点都是 `POST`。因此**不额外引入 CSRF token**。

- 触发条件（须重新评估）：将来支持跨站嵌入、或把 `VITE_API_BASE` 指向跨源地址（届时 Cookie 需 `SameSite=None`，必须同时上 CSRF token / double-submit）。

### 12.3 XSS

`httpOnly` 使令牌不可被 JS 读取，盗不走；但 XSS 仍可**以用户身份发起同源请求**。约束：前端不引入 `dangerouslySetInnerHTML`，用户可控内容（如 `displayName`、任务 `prompt`）一律按文本渲染——React 默认转义已覆盖，属于"不要主动放弃"的红线。

### 12.4 暴力破解与资源耗尽（**本次未防护**）

登录与注册无速率限制，且 `scrypt` 单次约 16 MiB / 50–100 ms，理论上是 DoS 放大器。

- 接入位置（明确留下）：在 `apps/api/src/routes/auth.ts` 的 `register` / `login` 上挂 `@fastify/rate-limit`（或按 IP + 邮箱的轻量内存计数）。
- 本次不做的理由：本地 demo 单机部署，接入会引入额外依赖与存储；而**代码结构上已把两个端点集中在一个路由插件内**，后续加一行插件注册即可。

### 12.5 账号枚举

- 登录保持统一 `401` + 相同文案 + 假哈希兜底（§6.3）。
- 注册返回 `409 email_taken` **确实暴露了"某邮箱已注册"**：这是产品必需（注册时必须告知用户），故接受；如需消除，须改为"发送邮件"流程（属邮箱验证范畴，本次不做）。

### 12.6 日志与错误信息

- Fastify 的默认日志不含请求体，但实现时仍须保证：`password` **绝不写入日志、错误信息或响应体**；不把 SQLite 原始异常透传给客户端（统一 `internal_error`）。
- 校验失败返回 `400`，不要因为"内部错误处理更省事"而把 zod 异常冒泡成 `500`。

### 12.7 生产部署前提

- 必须 HTTPS，且 `COOKIE_SECURE=true`（否则本地 http 调试被误带到生产，Cookie 可被明文链路截获）。
- 必须设置强随机 `JWT_SECRET`；缺失时进程直接启动失败是**有意为之**的安全默认。

## 13. 决策记录

| 编号 | 事项 | 结论 | 状态 |
| --- | --- | --- | --- |
| A1 | 会话机制 | `httpOnly` Cookie + 无状态签名 JWT，**不新增表** | ✅ 已定 |
| A2 | 「验证功能」含义 | 受保护路由的鉴权中间件 `requireAuth` / `requireAdmin`（非邮箱验证） | ✅ 已定 |
| A3 | 交付边界 | 前后端都做；引入 React Router，独立登录/注册/主页 | ✅ 已定 |
| A4 | 密码哈希 | `node:crypto` 的 `scrypt`，自描述格式，**不用原生模块** | ✅ 已定 |
| A5 | JWT 实现 | `jose`（HS256），**不自实现签名校验** | ✅ 已定 |
| A6 | Cookie 读写 | `@fastify/cookie`（Fastify 官方插件，依赖 `cookie` + `fastify-plugin`） | ✅ 已定 |
| A7 | 令牌策略 | 单令牌，TTL 默认 7 天，无 refresh token | ✅ 已定 |
| A8 | 登出语义 | 清除 Cookie；不做服务端吊销（局限见 §12.1） | ✅ 已定 |
| A9 | 首个管理员 | 环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 启动时幂等引导 | ✅ 已定 |
| A10 | 引导不覆盖密码 | 邮箱已存在时仅提升 `role`，不重置密码 | ✅ 已定 |
| A11 | 注册即登录 | 注册成功直接下发 Cookie，不二次跳转 | ✅ 已定 |
| A12 | 鉴权数据源 | 令牌只含 `sub`；`role` 每次回查数据库，故角色变更即时生效 | ✅ 已定 |
| A13 | 错误契约 | 统一 `{ error: { code, message, details } }`，`code` 为共享枚举 | ✅ 已定 |
| A14 | 邮箱归一化 | 复用查询层 `normalizeEmail`（小写 + trim），注册/登录/引导共用 | ✅ 已定 |
| A15 | 注册送积分 | 不发放，余额固定 `0`，留到第 8 步 | ✅ 已定 |
| A16 | 测试范围 | 仅 Vitest（查询层 + `inject` 集成），无 Playwright E2E | ✅ 已定 |
| A17 | 速率限制 / 会话吊销 / CSRF token | 本次不实现，风险与接入位置见 §12 | ⬜ 待后续 |

## 14. 落地步骤

1. ✅ `packages/shared`：新增 `schemas/auth.ts`（注册/登录请求、`PublicUser`、错误体与 `code` 枚举、`errorBody()`），并从 `index.ts` 导出。
2. ✅ 后端依赖：`apps/api` 增加 `jose`、`@fastify/cookie`（均为纯 JS，无原生模块，Dockerfile 未改动）。
3. ✅ `apps/api/src/auth/`：`config.ts` → `password.ts` → `token.ts` → `cookie.ts` → `public-user.ts` → `middleware.ts` → `admin-bootstrap.ts`，每层带测试。
4. ✅ `apps/api/src/db/queries/users.ts`：增补 `updateUserLastLogin` / `updateUserRole`。
5. ✅ `apps/api/src/routes/auth.ts`：4 个端点；`server.ts` 注册 `@fastify/cookie`、挂装饰器、执行管理员引导，`buildServer` 改为 async 并在建库前校验配置。
6. ✅ 前端：`apps/web` 增加 `react-router-dom`；`App.tsx` 改为路由；`features/auth/*`（hooks + 三个页面 + CSS Modules）；`api/client.ts` 增加 `HttpError` 与 `errorMessage()`。
7. ✅ 配置与文档：`.env.example`、`docker-compose.yml`、`README.md`。
8. ✅ 验证：`npm run typecheck && npm run test && npm run lint && npm run build` 全绿；dev 手跑注册 → 主页 → 登出 → 登录 → 管理员账号流程；`docker compose up --build` 复跑。
