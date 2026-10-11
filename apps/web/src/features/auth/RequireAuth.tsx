import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import styles from "./auth.module.css";
import { useSession } from "./useSession";

/** Wraps routes that require a session, remembering where the user was headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) return <p className={styles.status}>加载中…</p>;

  if (!user) {
    const redirect = encodeURIComponent(location.pathname);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
