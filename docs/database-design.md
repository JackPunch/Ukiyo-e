# 数据库表设计文档

> 目标数据库：SQLite（`node:sqlite`）；预留升级到 PostgreSQL 的路径。
> 本文档随迭代更新。当前版本落定 **用户、任务、图片、积分流水** 四张表（`users` / `tasks` / `images` / `point_transactions`），并说明如何为后续的**管理员**系统预留结构。

## 1. 背景与范围

对应开发路线图（见 `note.md`）第 2 步：落定用户、任务、图片、积分流水四张表，并实现对应的数据库访问函数。

- **本次范围**：`users`、`tasks`、`images`、`point_transactions` 四张表（§3、§4、§5、§6）。
- **前瞻范围**：管理员系统的设计（通过 `users.role` 表达）见 §7。
- **不在本次范围**：认证流程、后台 Worker、AI 供应商调用、图片落盘的具体实现（此处只定表结构与字段语义）。

## 2. 命名与类型约定

统一约定，避免后续迁移时返工。

| 主题 | 约定 | 理由 |
| --- | --- | --- |
| 表名 | 小写蛇形、复数（`users`） | 兼容 PostgreSQL 习惯 |
| 列名 | 小写蛇形（`password_hash`） | 同上 |
| 主键 | `id INTEGER PRIMARY KEY AUTOINCREMENT` | SQLite 下最小开销；升级 PG 时映射为 `GENERATED ALWAYS AS IDENTITY`。若将来需要对外隐藏自增规律，再改为 `TEXT` 存 UUID |
| 时间 | `TEXT`，ISO-8601 UTC（`2026-10-11T09:44:25.123Z`） | SQLite 无原生日期类型；ISO 字符串可直接被 JS `new Date()` 解析，且可字典序排序 |
| 时间默认值 | `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` | 带毫秒与 `Z`，与 `Date.prototype.toISOString()` 一致 |
| 布尔 | `INTEGER`，`0`/`1` | SQLite 惯例 |
| 枚举 | `TEXT` + `CHECK (... IN (...))` | 无独立枚举类型，用 CHECK 约束收敛取值 |
| 金额/积分 | `INTEGER` | 积分为整数；避免浮点误差。若将来引入真实货币再单独讨论 |
| 结构化参数 | `TEXT` 存 JSON（如 `tasks.params`） | SQLite 无 JSON 类型；`node:sqlite` 自带 JSON1 可查询。供应商参数易变，存 JSON 避免频繁改表 |
| 外键 | 显式 `REFERENCES`，连接已开启 `PRAGMA foreign_keys = ON` | 见 `apps/api/src/db/client.ts` |

`updated_at` 的维护：SQLite 没有 `ON UPDATE`。**默认由查询层在 `UPDATE` 时显式写入**（简单、可测）；批量场景也可选用触发器，二选一，全项目保持一致。

## 3. 用户表 `users`

### 3.1 字段定义

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK, AUTOINCREMENT | 主键 |
| `email` | TEXT | NOT NULL, UNIQUE | 登录标识。**写入前统一转小写**（见 3.3） |
| `display_name` | TEXT | NULL | 展示名。注册时可选 |
| `password_hash` | TEXT | NOT NULL | 密码哈希，**绝不存明文**。算法见 3.3 |
| `role` | TEXT | NOT NULL DEFAULT `'user'`, CHECK IN (`user`,`admin`) | 权限角色。管理员即 `'admin'` |
| `points_balance` | INTEGER | NOT NULL DEFAULT `0`, CHECK >= 0 | 当前积分余额（**缓存值**，权威来源见 §6 流水表） |
| `last_login_at` | TEXT | NULL | 最近登录时间 |
| `created_at` | TEXT | NOT NULL DEFAULT now | 创建时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT now | 更新时间 |

### 3.2 DDL

```sql
CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  display_name   TEXT,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('user', 'admin')),
  points_balance INTEGER NOT NULL DEFAULT 0
                   CHECK (points_balance >= 0),
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

索引：`UNIQUE(email)` 已自动建立唯一索引，满足登录查询，无需额外索引。`role` 基数低，暂不建索引。

### 3.3 设计说明

- **为什么 `role` 放在 `users` 而不是单独的 `admins` 表**（本次决策）：管理员本质是「拥有更高权限的用户」，放在同表可以让登录、权限判断、审计逻辑只维护一条路径；避免两表都要处理 email 唯一性、密码哈希等重复约束。若将来角色种类变多（如 `moderator`、`operator`），再演进为 `roles` + `user_roles` 多对多；届时 `role` 列可保留为「主角色」或逐步废弃。
- **注册 vs 管理创建**：公开注册走 `registerUser`，它把 `role` 固定为 `'user'`、`points_balance` 固定为 `0`，调用方无从指定；`createUser` 允许设置 `role` 与积分，仅供管理员 / 系统内部调用。这样注册接口即使透传请求体也无法自封管理员。
- **email 唯一性与大小写**：SQLite 的 `UNIQUE` 默认区分大小写。约定在 **`apps/api/src/db/queries/users.ts` 的 `normalizeEmail`** 里把 email 归一化为小写（`email.trim().toLowerCase()`）后再入库，`createUser` / `findUserByEmail` 共用这一处，保证「同一邮箱不可重复注册」且查找一致。若将来改成 `email TEXT NOT NULL UNIQUE COLLATE NOCASE` 也可行，但需注意 NOCASE 只处理 ASCII。
- **密码哈希**：存哈希不存明文。可选 Node 内置 `crypto.scrypt`（零依赖，契合项目「不引第三方」的取向），或 `argon2`/`bcrypt`。具体算法在实现认证时确定，但**字段语义不变**（自包含的哈希字符串，含算法与 salt 参数）。
- **不做禁用**：v1 不提供账号禁用功能，故不设 `status` 列。管理员「管理用户」仅涉及改 `role`、调积分，以及删除用户。删除采用物理删除（`DELETE`）即可满足需求；是否改为软删除 `deleted_at` 见第 5 节待定项。
- **`points_balance` 现在就加**：默认 `0` 成本极低，且能避免将来在热门表上做 `ALTER TABLE ADD COLUMN`（SQLite 改列需重建表，成本高）。真正的积分账本见 §6。

## 4. 任务表 `tasks`

一次「生图任务」对应一条记录：用户提交 prompt → 任务入队 → Worker 调用 AI 供应商 → 落定成功 / 失败。任务的产出是图片，见 §5。

### 4.1 字段定义

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK, AUTOINCREMENT | 主键 |
| `user_id` | INTEGER | NOT NULL, REFERENCES `users(id)` | 创建者。默认 `NO ACTION`：用户仍有关联任务时禁止删除该用户 |
| `status` | TEXT | NOT NULL DEFAULT `'queued'`, CHECK IN (`queued`,`running`,`succeeded`,`failed`,`canceled`) | 任务状态机，驱动前端轮询与 Worker 领取 |
| `prompt` | TEXT | NOT NULL | 正向提示词。需展示 / 检索，故独立成列 |
| `model` | TEXT | NULL | 供应商 / 模型标识，便于历史展示与排障 |
| `params` | TEXT | NULL | JSON 字符串：尺寸、seed、`negative_prompt`、生成张数 `n` 等供应商参数 |
| `points_cost` | INTEGER | NOT NULL DEFAULT `0`, CHECK >= 0 | 本次消耗积分（**展示缓存**，权威账本见 6.2） |
| `error` | TEXT | NULL | 失败原因（超时、供应商报错等），仅 `failed` 时有值 |
| `attempts` | INTEGER | NOT NULL DEFAULT `0` | Worker 重试次数 |
| `created_at` | TEXT | NOT NULL DEFAULT now | 入队时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT now | 更新时间（状态流转时显式写入） |
| `started_at` | TEXT | NULL | Worker 开始处理的时刻 |
| `finished_at` | TEXT | NULL | 成功 / 失败落定的时刻 |

### 4.2 DDL

```sql
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  prompt      TEXT NOT NULL,
  model       TEXT,
  params      TEXT,
  points_cost INTEGER NOT NULL DEFAULT 0 CHECK (points_cost >= 0),
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at  TEXT,
  finished_at TEXT
);

-- 历史列表：按创建者分页、按时间倒序
CREATE INDEX idx_tasks_user_created ON tasks (user_id, created_at DESC);
-- Worker 领取待办：按状态取最早的任务
CREATE INDEX idx_tasks_status ON tasks (status, id);
```

### 4.3 设计说明

- **状态机**：`queued → running → succeeded | failed`，另有 `canceled` 供将来手动取消。前端轮询只读 `status` 与时间戳；Worker 用 `idx_tasks_status` 取最早的 `queued` 任务并置为 `running`（同时写 `started_at`）。路线图第 6 步要求的「排队 / 生成中 / 成功 / 失败」四个状态由此完全覆盖。
- **为什么 `prompt` 独立成列、其余参数塞 `params`**：`prompt` 需要展示与检索，值得独立建列；尺寸、seed、`negative_prompt`、生成张数 `n` 等随供应商而异，放 JSON（`node:sqlite` 自带 JSON1 函数）可避免每次接入新供应商都改表。JSON 的解析在查询层完成，对外暴露为类型化对象。
- **`points_cost` 现在就加**：与 `users.points_balance` 同属「缓存」思路——列表页直接显示消耗，免去 join 流水；权威账本仍是 §6 的 `point_transactions`，通过 `ref_type='task'` + `ref_id` 关联，**不在此处建外键**。
- **`started_at` / `finished_at` / `attempts`**：服务第 6 步的 Worker 与超时、重试逻辑，也用于统计耗时。v1 可先留空。
- **删除与级联**：任务采用**物理删除**；`images.task_id` 上的 `ON DELETE CASCADE` 会连带删除图片元数据，**磁盘文件由查询层在删除任务时一并清理**（SQLite 不管理文件系统）。用户侧保持默认 `NO ACTION`：仍有任务时禁止删除用户，避免历史数据悬空（见 D4）。
- **`listTasks` 必须带 `userId`**：函数签名把 `userId` 设为**必填**，「查某用户历史」不会退化成查全员；确需全量查询时另开带权限校验的管理入口。
- **索引**：`(user_id, created_at DESC)` 覆盖「查某用户历史并按时间分页」；`(status, id)` 覆盖 Worker「按状态取最早任务」。`status` 基数虽低，但配合 `id` 排序可避免全表扫描与额外排序。

## 5. 图片表 `images`

图片**元数据入库、像素落本地目录**（路线图第 7 步）。一个任务可产出多张图片（`n > 1`），故与 `tasks` 为一对多关系。

### 5.1 字段定义

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK, AUTOINCREMENT | 主键 |
| `task_id` | INTEGER | NOT NULL, REFERENCES `tasks(id)` ON DELETE CASCADE | 归属任务；删任务时级联删本行 |
| `position` | INTEGER | NOT NULL DEFAULT `0` | 同一任务内的顺序（0 起），用于稳定排列多图 |
| `file_path` | TEXT | NOT NULL | **相对存储根目录**的路径，不存绝对路径 |
| `mime_type` | TEXT | NOT NULL | 如 `image/png`、`image/webp` |
| `width` | INTEGER | NULL | 像素宽，供前端布局 |
| `height` | INTEGER | NULL | 像素高，供前端布局 |
| `file_size` | INTEGER | NULL | 字节数 |
| `sha256` | TEXT | NULL | 内容哈希，用于去重 / 完整性校验（可选） |
| `source_url` | TEXT | NULL | 供应商原始 URL；可能过期，仅留痕排障用 |
| `created_at` | TEXT | NOT NULL DEFAULT now | 入库时间 |

### 5.2 DDL

```sql
CREATE TABLE images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  file_path  TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  file_size  INTEGER,
  sha256     TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 按任务取图（含多图排序）
CREATE INDEX idx_images_task ON images (task_id, position);
```

### 5.3 设计说明

- **只存相对路径**：`file_path` 相对一个可配置的存储根目录（`STORAGE_ROOT`，第 7 步引入；Docker 下挂卷），迁移目录或重建容器都不会让元数据失效。
- **元数据 vs 文件**：SQLite 只保存尺寸、类型、大小、哈希等描述信息，像素数据落磁盘。删除时应当「先删 `images` 行（或依赖级联），再由查询层删除对应文件」，两件事在同一业务操作里完成，避免出现孤儿文件。
- **一对多与 `position`**：一个任务生成多张图时用 `position` 排序供前端按序展示；只生成一张时 `position` 恒为 `0`。
- **外键方向（为什么 `tasks` 不存图片 ID）**：一对多时外键放在「多」的一侧，即 `images.task_id` 指向 `tasks`，「某任务的图片」通过 `WHERE task_id = ?` 查询得到。反之若把图片 ID 存进 `tasks`（JSON 数组或逗号串），则无法建外键约束、无法用索引反查归属，增删改都别扭；若再加 `cover_image_id` 之类列还会造成两表循环引用。故本设计**不在 `tasks` 上记录图片 ID**；列表页需要缩略图时由查询层用 join 或 `task_id IN (...)` 批量取图。
- **不可变**：图片行创建后不再修改，故不设 `updated_at`；需要重新生成即新建任务。
- **可选字段**：`sha256` 用于去重与校验，`source_url` 仅作排障留痕，v1 均可为空。

## 6. 积分流水表 `point_transactions`

核心决策：**流水表为准，`users.points_balance` 为缓存**。追加写（append-only），任何加减都产生一条记录 → 可审计、可对账、可算历史消耗。每次变更由查询层的 `recordPointTransaction` 在同一事务内「插入流水 + 更新余额」。

### 6.1 字段定义

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK, AUTOINCREMENT | 主键 |
| `user_id` | INTEGER | NOT NULL, REFERENCES `users(id)` | 账户所有者（有引用时禁止删用户，见 6.3） |
| `amount` | INTEGER | NOT NULL | 正数入账、负数扣减 |
| `balance_after` | INTEGER | NOT NULL | 记账后余额快照，便于对账 |
| `reason` | TEXT | NOT NULL, CHECK IN (`signup_bonus`,`task_spend`,`task_refund`,`admin_adjust`) | 变更原因 |
| `ref_type` | TEXT | NULL | 关联对象类型，如 `'task'` |
| `ref_id` | INTEGER | NULL | 关联对象主键 |
| `note` | TEXT | NULL | 备注（管理员调整时填写） |
| `created_by` | INTEGER | NULL, REFERENCES `users(id)` | 操作管理员；系统入账为 NULL |
| `created_at` | TEXT | NOT NULL DEFAULT now | 记账时间 |

### 6.2 DDL

```sql
CREATE TABLE point_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason        TEXT NOT NULL
                  CHECK (reason IN ('signup_bonus','task_spend','task_refund','admin_adjust')),
  ref_type      TEXT,
  ref_id        INTEGER,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 用户流水历史，最新在前
CREATE INDEX idx_point_tx_user_created
  ON point_transactions (user_id, created_at DESC);
```

### 6.3 设计说明

- **流水为准、余额为缓存**：查询余额走 `users.points_balance`（快），查明细走流水。`balance_after` 便于核对「余额 = 最后一条流水的 `balance_after`」，排查并发 / 回滚问题。
- **原子写入**：`recordPointTransaction` 用 `SAVEPOINT`（而非 `BEGIN`）包住「读余额 → 更新余额 → 插流水」：既保证原子提交，又能在调用方已有事务时安全嵌套（如第 8 步「创建任务 + 扣积分」）。余额不足时 `users` 的 `CHECK (points_balance >= 0)` 会拒绝并整体回滚，不产生半条记录。
- **`reason` 取值**：修改 CHECK 需重建表，故实现时集中定义、审慎增补（如将来加 `'daily_reward'`）。
- **与任务的关系**：`task_spend` / `task_refund` 通过 `ref_type='task'` + `ref_id` 指向任务（见 §4），**不在此处建外键**，保持流水表与业务表松耦合。
- **删除保护**：`user_id` 用默认 `NO ACTION`——用户仍持有流水时**禁止删除该用户**（与 D4、`tasks.user_id` 一致），账本不会被静默清空；`created_by` 同样不级联（留痕）。若将来要支持带引用删用户，再引入软删除。

## 7. 面向未来的扩展设计

### 7.1 管理员系统

采用 `users.role`（已确认）。

- 授权：在 Fastify 侧增加 `requireAdmin` 前置钩子，读取当前登录用户的 `role`，非 `admin` 返回 403。属于接口层，不进表结构。
- 管理员「管理用户」= 对 `users` 表的读 + 改 `role`/`points_balance`，以及删除用户。
- 建议（可选，后续加）：`admin_audit_log` 表，记录「谁在何时改了谁的什么」，例如：

```sql
CREATE TABLE admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,          -- 如 'user.disable'、'points.adjust'
  target_type TEXT NOT NULL,          -- 如 'user'
  target_id   INTEGER NOT NULL,
  detail      TEXT,                   -- JSON 字符串，记录变更内容
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

### 7.2 与任务 / 图片表的关系

- 表关系：`users (1) ──< tasks (1) ──< images`。
- `tasks.user_id` → `users.id`（创建者）；`images.task_id` → `tasks.id`（图片归属任务），后者带 `ON DELETE CASCADE`。
- 积分的消耗 / 退款通过 `point_transactions` 的 `ref_type='task'` + `ref_id` 指向任务，**不在任务表上建外键**。
- 权限判断只在 `users.role`；积分只在 §6；两者都不需要在任务 / 图片表里冗余。

## 8. 待定与决策记录

| 编号 | 事项 | 当前倾向 | 状态 |
| --- | --- | --- | --- |
| D1 | 管理员表达方式 | 单一 `users.role` 字段 | ✅ 已定 |
| D2 | 积分模型 | 余额缓存 + `point_transactions` 流水 | ✅ 已定 |
| D3 | 主键类型 | `INTEGER AUTOINCREMENT` | ✅ 已定 |
| D4 | 用户删除方式 | v1 物理删除；仍有任务时禁止删除（`tasks.user_id` 默认 `NO ACTION`） | ✅ 已定 |
| D5 | 密码哈希算法 | `crypto.scrypt`（零依赖，自描述格式） | ✅ 已定（见 docs/auth-design.md §3） |
| D6 | 是否记录登录 `last_login_at` | 保留字段，登录成功时由 `updateUserLastLogin` 更新 | ✅ 已定 |
| D7 | `updated_at` 维护方式 | 查询层显式写入（非触发器）；写 `UPDATE` 的查询函数同时更新 `updated_at` | ✅ 已定 |
| D8 | 任务↔图片基数 | 一对多；外键在 `images.task_id`，`tasks` 不存图片 ID（`position` 排序） | ✅ 已定 |
| D9 | 删除级联 | 删任务级联删图片元数据 + 磁盘文件；删用户有任务则拒绝 | ✅ 已定 |
| D10 | 任务参数存储 | `prompt` 独立列 + `params` 存 JSON 文本 | ✅ 已定 |
| D11 | 任务状态枚举 | `queued` / `running` / `succeeded` / `failed` / `canceled` | ✅ 已定 |
| D12 | `tasks.points_cost` | 现在就加，作展示缓存，权威见流水表 | ✅ 已定 |
| D13 | 积分写入原子性 | `recordPointTransaction` 用 `SAVEPOINT` 原子「插流水 + 更新余额」，可嵌套 | ✅ 已定 |
| D14 | 用户删除保护 | `tasks.user_id` 与 `point_transactions.user_id` 均为 `NO ACTION`：有引用则拒绝删用户 | ✅ 已定 |

## 9. 落地步骤

1. ✅ 已落地：迁移 `apps/api/src/db/migrations/0002_users.sql` 建 `users` 表，并 `DROP` 掉 `0001` 的示例 `projects` 表（该表仅用于验证迁移流程）。
2. ✅ 已落地：`apps/api/src/db/queries/users.ts` 提供 **注册 `registerUser`**（固定安全默认）、**创建用户 `createUser`**（管理用途）、**按 email / id 查找 `findUserByEmail` / `findUserById`**、**分页列表 `listUsers`**（含测试）。改 role、调积分、删除用户待补。
3. ✅ 已落地（§4、§5）：迁移 `apps/api/src/db/migrations/0003_tasks_images.sql` 建 `tasks`、`images` 表与索引；查询模块 `apps/api/src/db/queries/tasks.ts`（创建 / 查找 / 分页 `listTasks` / 删除）与 `images.ts`（创建 / 查找 / 删除），风格对齐 `users.ts`，含 Vitest 测试。
4. ✅ 已落地（§6）：迁移 `apps/api/src/db/migrations/0004_point_transactions.sql` 建 `point_transactions` 表与索引；查询模块 `apps/api/src/db/queries/point-transactions.ts` 提供 `recordPointTransaction`（原子记账）/ `findPointTransactionById` / `listPointTransactions`，含 Vitest 测试。
5. 图片落盘与 `STORAGE_ROOT`（第 7 步）在实现存储逻辑时引入。
6. 第 8 步接入业务时，用 `recordPointTransaction` 记录 `signup_bonus` / `task_spend` / `task_refund`，并复用其原子事务。
7. 管理员上线时再加 `requireAdmin` 钩子（§7.1）。
