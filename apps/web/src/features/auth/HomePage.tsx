import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { useHealthCheck } from "../health/useHealthCheck";
import styles from "./home.module.css";
import { useLogout } from "./useLogout";
import { useSession } from "./useSession";

export function HomePage() {
  const { user } = useSession();
  const logout = useLogout();
  const health = useHealthCheck();

  // RequireAuth already guarantees a user; this keeps the type honest.
  if (!user) return null;

  return (
    <div className={styles.page}>
      <h1>Ukiyo-e</h1>
      <p>AI 制图工作流</p>

      <dl className={styles.summary}>
        <dt>邮箱</dt>
        <dd>{user.email}</dd>
        <dt>展示名</dt>
        <dd>{user.displayName ?? "—"}</dd>
        <dt>角色</dt>
        <dd>{user.role === "admin" ? "管理员" : "普通用户"}</dd>
        <dt>积分余额</dt>
        <dd>{user.pointsBalance}</dd>
        <dt>最近登录</dt>
        <dd>
          {user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleString()
            : "—"}
        </dd>
      </dl>

      <div className={styles.actions}>
        {user.role === "admin" && (
          <Link className={styles.adminLink} to="/admin/users">
            用户管理
          </Link>
        )}

        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? "登出中…" : "登出"}
        </button>

        <button type="button" onClick={() => health.mutate()} disabled={health.isPending}>
          {health.isPending ? "检查中…" : "检查后端"}
        </button>
      </div>

      {logout.isError && <p className={styles.error}>{errorMessage(logout.error)}</p>}
      {health.isError && (
        <p className={styles.error}>请求失败：{health.error.message}</p>
      )}
      {health.isSuccess && (
        <pre className={styles.debug}>{JSON.stringify(health.data, null, 2)}</pre>
      )}
    </div>
  );
}
