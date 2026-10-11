import type { DatabaseSync } from "node:sqlite";
import type { FastifyBaseLogger } from "fastify";
import {
  createUser,
  findUserByEmail,
  updateUserRole,
} from "../db/queries/users";
import { hashPassword } from "./password";

/** Same lower bound as registration, so bootstrap cannot mint a weak admin. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Idempotently makes `ADMIN_EMAIL` an administrator (docs/auth-design.md §9):
 *
 * - the account exists → only ensure `role = 'admin'`, **never** reset a
 *   password (the env var is long-lived config; overwriting would quietly undo
 *   a password the user changed);
 * - the account is missing and `ADMIN_PASSWORD` is set → create it;
 * - required input is missing → log and carry on, a misconfigured bootstrap
 *   must not stop the server from starting.
 */
export async function ensureAdminFromEnv(
  db: DatabaseSync,
  logger: FastifyBaseLogger,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const email = env.ADMIN_EMAIL?.trim();
  if (!email) {
    logger.info("ADMIN_EMAIL 未设置，跳过管理员引导");
    return;
  }

  const existing = findUserByEmail(db, email);
  if (existing) {
    if (existing.role === "admin") return;

    updateUserRole(db, existing.id, "admin");
    logger.info({ email: existing.email }, "已将既有账号提升为管理员");
    return;
  }

  const password = env.ADMIN_PASSWORD;
  if (!password) {
    logger.warn({ email }, "ADMIN_EMAIL 已设置但缺少 ADMIN_PASSWORD，无法创建管理员");
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    logger.warn(
      { email, minLength: MIN_PASSWORD_LENGTH },
      "ADMIN_PASSWORD 过短，拒绝创建管理员",
    );
    return;
  }

  // Bypasses registerUser on purpose: that entry point pins the role to 'user'.
  const admin = createUser(db, {
    email,
    passwordHash: await hashPassword(password),
    role: "admin",
  });
  logger.info({ email: admin.email }, "已创建管理员账号");
}
