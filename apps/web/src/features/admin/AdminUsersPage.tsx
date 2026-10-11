import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import styles from "./admin.module.css";
import { useCreateUser } from "./useCreateUser";
import { useUsers } from "./useUsers";

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  // Search box text vs. the keyword actually sent (applied on submit).
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [offset, setOffset] = useState(0);

  const users = useUsers({ limit: PAGE_SIZE, offset, q: keyword });

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const createUser = useCreateUser();

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setKeyword(query.trim());
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createUser.mutate(
      {
        email,
        password,
        // The API rejects an empty string, so omit an untouched field.
        displayName: displayName.trim() === "" ? undefined : displayName,
      },
      {
        onSuccess: () => {
          setEmail("");
          setDisplayName("");
          setPassword("");
        },
      },
    );
  }

  const data = users.data;
  const total = data?.total ?? 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>用户管理</h1>
        <Link className={styles.link} to="/">返回首页</Link>
      </header>

      <section className={styles.card}>
        <h2>创建用户</h2>
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.field}>
            <label htmlFor="admin-new-email">邮箱</label>
            <input
              id="admin-new-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="admin-new-name">展示名（可选）</label>
            <input
              id="admin-new-name"
              type="text"
              maxLength={50}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="admin-new-password">密码（至少 8 位）</label>
            <input
              id="admin-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button
            className={styles.submit}
            type="submit"
            disabled={createUser.isPending}
          >
            {createUser.isPending ? "创建中…" : "创建用户"}
          </button>

          {createUser.isError && (
            <p className={styles.error}>{errorMessage(createUser.error)}</p>
          )}
          {createUser.isSuccess && (
            <p className={styles.success}>
              已创建用户 {createUser.data.email}
            </p>
          )}
        </form>
      </section>

      <section className={styles.cardWide}>
        <div className={styles.searchRow}>
          <h2>用户列表</h2>
          <form className={styles.search} onSubmit={handleSearch}>
            <input
              type="search"
              placeholder="按邮箱或展示名查找"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">查找</button>
          </form>
        </div>

        {users.isLoading && <p className={styles.status}>加载中…</p>}
        {users.isError && (
          <p className={styles.error}>{errorMessage(users.error)}</p>
        )}

        {data && (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>邮箱</th>
                  <th>展示名</th>
                  <th>角色</th>
                  <th>积分</th>
                  <th>最近登录</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.email}</td>
                    <td>{user.displayName ?? "—"}</td>
                    <td>{user.role === "admin" ? "管理员" : "普通用户"}</td>
                    <td>{user.pointsBalance}</td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>{new Date(user.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td className={styles.empty} colSpan={7}>
                      没有匹配的用户
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className={styles.pager}>
              <button
                type="button"
                disabled={!hasPrevious}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                上一页
              </button>
              <span>共 {total} 位用户</span>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                下一页
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
