import { useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { errorMessage } from "../../api/client";
import styles from "./auth.module.css";
import { useLogin } from "./useLogin";
import { useSession } from "./useSession";

/** Only same-site relative paths, so `?redirect=` cannot send users off-site. */
function safeRedirect(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginPage() {
  const { user, isLoading } = useSession();
  const [params] = useSearchParams();
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const redirect = safeRedirect(params.get("redirect"));

  // Already signed in: no reason to show the form.
  if (!isLoading && user) return <Navigate to={redirect} replace />;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => navigate(redirect, { replace: true }) },
    );
  }

  return (
    <div className={styles.page}>
      <h1>登录</h1>

      <div className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="login-email">邮箱</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="login-password">密码</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button className={styles.submit} type="submit" disabled={login.isPending}>
            {login.isPending ? "登录中…" : "登录"}
          </button>

          {login.isError && (
            <p className={styles.error}>{errorMessage(login.error)}</p>
          )}
        </form>
      </div>

      <p className={styles.hint}>
        还没有账号？<Link className={styles.link} to="/register">去注册</Link>
      </p>
    </div>
  );
}
