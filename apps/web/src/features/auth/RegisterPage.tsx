import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../../api/client";
import styles from "./auth.module.css";
import { useRegister } from "./useRegister";
import { useSession } from "./useSession";

export function RegisterPage() {
  const { user, isLoading } = useSession();
  const register = useRegister();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  // Already signed in: no reason to show the form.
  if (!isLoading && user) return <Navigate to="/" replace />;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate(
      {
        email,
        password,
        // The API rejects an empty string, so omit an untouched field.
        displayName: displayName.trim() === "" ? undefined : displayName,
      },
      { onSuccess: () => navigate("/", { replace: true }) },
    );
  }

  return (
    <div className={styles.page}>
      <h1>注册</h1>

      <div className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="register-email">邮箱</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="register-name">展示名（可选）</label>
            <input
              id="register-name"
              type="text"
              maxLength={50}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="register-password">密码（至少 8 位）</label>
            <input
              id="register-password"
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
            disabled={register.isPending}
          >
            {register.isPending ? "注册中…" : "注册并登录"}
          </button>

          {register.isError && (
            <p className={styles.error}>{errorMessage(register.error)}</p>
          )}
        </form>
      </div>

      <p className={styles.hint}>
        已有账号？<Link className={styles.link} to="/login">去登录</Link>
      </p>
    </div>
  );
}
