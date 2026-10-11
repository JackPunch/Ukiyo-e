import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../auth/useSession";
import styles from "./admin.module.css";

/**
 * Wraps admin-only routes. The server enforces authorization anyway; this only
 * keeps non-admins from landing on a page that would 403.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();

  if (isLoading) return <p className={styles.status}>加载中…</p>;
  if (user?.role !== "admin") return <Navigate to="/" replace />;

  return <>{children}</>;
}
