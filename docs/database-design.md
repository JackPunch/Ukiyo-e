# 数据库表设计文档

> 目标数据库：SQLite（`node:sqlite`）；预留升级到 PostgreSQL 的路径。
> 本文档随迭代更新。当前版本聚焦 **用户表**，并说明如何为后续的**管理员**、**积分**系统预留结构。

## 1. 背景与范围

对应开发路线图（见 `note.md`）第 2 步：先落定用户表，后续扩展任务、图片表。

- **本次范围**：`users` 表。
- **前瞻范围**：为管理员、积分系统预留的设计（管理员通过 `users.role` 表达；积分通过「余额字段 + 流水表」表达）。
- **不在本次范围**：任务表、图片表（后续单独设计），认证流程实现细节。

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
| `points_balance` | INTEGER | NOT NULL DEFAULT `0`, CHECK >= 0 | 当前积分余额（**缓存值**，权威来源见 4.2 节流水表） |
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
- **email 唯一性与大小写**：SQLite 的 `UNIQUE` 默认区分大小写。约定在 **`apps/api/src/db/queries/users.ts` 的 `normalizeEmail`** 里把 email 归一化为小写（`email.trim().toLowerCase()`）后再入库，`createUser` / `findUserByEmail` 共用这一处，保证「同一邮箱不可重复注册」且查找一致。若将来改成 `email TEXT NOT NULL UNIQUE COLLATE NOCASE` 也可行，但需注意 NOCASE 只处理 ASCII。
- **密码哈希**：存哈希不存明文。可选 Node 内置 `crypto.scrypt`（零依赖，契合项目「不引第三方」的取向），或 `argon2`/`bcrypt`。具体算法在实现认证时确定，但**字段语义不变**（自包含的哈希字符串，含算法与 salt 参数）。
- **不做禁用**：v1 不提供账号禁用功能，故不设 `status` 列。管理员「管理用户」仅涉及改 `role`、调积分，以及删除用户。删除采用物理删除（`DELETE`）即可满足需求；是否改为软删除 `deleted_at` 见第 5 节待定项。
- **`points_balance` 现在就加**：默认 `0` 成本极低，且能避免将来在热门表上做 `ALTER TABLE ADD COLUMN`（SQLite 改列需重建表，成本高）。真正的积分账本见 4.2 节。

## 4. 面向未来的扩展设计

### 4.1 管理员系统

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

### 4.2 积分系统

核心决策：**流水表为准，`users.points_balance` 为缓存**。

- `point_transactions` 追加写（append-only），任何加减都产生一条记录 → 可审计、可对账、可算历史消耗。
- 每次变更在同一事务内：插入流水 + 更新 `users.points_balance`。查询余额走 `users`（快），查明细走流水。

```sql
CREATE TABLE point_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,       -- 正数入账，负数扣减
  balance_after INTEGER NOT NULL,       -- 记账后余额快照，便于对账
  reason        TEXT NOT NULL
                  CHECK (reason IN ('signup_bonus','task_spend','task_refund','admin_adjust')),
  ref_type      TEXT,                   -- 关联对象类型，如 'task'
  ref_id        INTEGER,                -- 关联对象主键
  note          TEXT,                   -- 备注（管理员调整时填写）
  created_by    INTEGER REFERENCES users(id),  -- 操作管理员；系统入账为 NULL
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_point_tx_user_created
  ON point_transactions (user_id, created_at DESC);
```

- `reason` 取值随业务扩展（如加 `'daily_reward'`）；修改 CHECK 需重建表，故实现时把取值范围集中定义、审慎增补。
- 为什么加 `balance_after`：便于快速核对「余额 = 最后一条流水的 `balance_after`」，排查并发或回滚问题。
- 与任务表的关系：`task_spend` 流水通过 `ref_type='task'` + `ref_id` 指向任务，不在此处建外键（任务表尚未定稿）。

### 4.3 与后续表的关系（前瞻）

- `tasks.user_id` → `users.id`（创建者）。
- `images.task_id` → `tasks.id`（图片归属任务）。
- 权限判断只在 `users.role`；积分只在 4.2 节；两者都不需要在任务/图片表里冗余。

## 5. 待定与决策记录

| 编号 | 事项 | 当前倾向 | 状态 |
| --- | --- | --- | --- |
| D1 | 管理员表达方式 | 单一 `users.role` 字段 | ✅ 已定 |
| D2 | 积分模型 | 余额缓存 + `point_transactions` 流水 | ✅ 已定 |
| D3 | 主键类型 | `INTEGER AUTOINCREMENT` | ✅ 已定 |
| D4 | 用户删除方式 | v1 物理删除（`DELETE`）；需要保留数据时再加 `deleted_at` 软删除 | ⬜ 待定 |
| D5 | 密码哈希算法 | `crypto.scrypt`（零依赖）等实现时定 | ⬜ 待定 |
| D6 | 是否记录登录 `last_login_at` | 保留字段，登录成功时更新 | ⬜ 待定 |
| D7 | `updated_at` 维护方式 | 查询层显式写入（非触发器） | ⬜ 待定 |

## 6. 落地步骤（与本表相关）

1. ✅ 已落地：新增迁移 `apps/api/src/db/migrations/0002_users.sql`，建 `users` 表，并 `DROP` 掉 `0001` 的示例 `projects` 表（该表仅用于验证迁移流程）。
2. 🚧 进行中：`apps/api/src/db/queries/users.ts` 已提供 **创建用户 `createUser`**、**按 email 查找 `findUserByEmail`**、**分页列表 `listUsers`** 三个函数（含测试）。改 role、调积分、删除用户待补。入参出参暂用 TypeScript 类型：这些是内部函数，运行时校验等到暴露 HTTP 时放到路由层（用 `packages/shared` 的 zod schema）。
3. 积分上线时再加 `000N_point_transactions.sql`（4.2 节），并在同一事务里同步 `users.points_balance`。
4. 管理员上线时再加 `requireAdmin` 钩子（4.1 节）。
