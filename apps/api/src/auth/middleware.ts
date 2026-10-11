import { errorBody, type PublicUser } from "@ukiyo-e/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { findUserById } from "../db/queries/users";
import type { AuthConfig } from "./config";
import { SESSION_COOKIE_NAME } from "./cookie";
import { toPublicUser } from "./public-user";
import { verifySessionToken } from "./token";

declare module "fastify" {
  interface FastifyRequest {
    /** Current user once `requireAuth` has passed; `null` otherwise. */
    user: PublicUser | null;
  }

  interface FastifyInstance {
    /** preHandler: validates the session, answers 401 when it is missing or stale. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: must be chained after `requireAuth`; answers 403 for non-admins. */
    requireAdmin: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

/**
 * Session guard: verify the token, then re-read the user from the database.
 * The extra lookup is a primary-key read and buys two behaviours for free —
 * deleted users stop working immediately, and role changes apply without
 * re-login (docs/auth-design.md §5.3).
 */
export function createRequireAuth(config: AuthConfig) {
  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const userId = token ? await verifySessionToken(token, config) : undefined;
    const row =
      userId === undefined ? undefined : findUserById(request.server.db, userId);

    if (!row) {
      request.user = null;
      reply.status(401).send(errorBody("unauthorized", "请先登录"));
      return;
    }

    request.user = toPublicUser(row);
  };
}

/** Authorization guard; `request.user` is already set by `createRequireAuth`. */
export function createRequireAdmin() {
  return async function requireAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (request.user?.role !== "admin") {
      reply.status(403).send(errorBody("forbidden", "需要管理员权限"));
    }
  };
}
