import {
  adminCreateUserRequestSchema,
  adminUserListQuerySchema,
  errorBody,
} from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import { hashPassword } from "../auth/password";
import { toPublicUser } from "../auth/public-user";
import {
  createUser,
  findUserByEmail,
  listUsers,
  type UserRow,
} from "../db/queries/users";
import { isUniqueViolation, sendValidationError } from "./helpers";

/**
 * Admin-only user management (docs/admin-design.md). Every route is chained
 * behind `requireAuth` then `requireAdmin`, so authorization is the same
 * database-backed check used everywhere else.
 */
export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  const guards = [app.requireAuth, app.requireAdmin];

  app.post(
    "/admin/users",
    { preHandler: guards },
    async (request, reply) => {
      const parsed = adminCreateUserRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const { email, password, displayName } = parsed.data;
      if (findUserByEmail(app.db, email)) {
        return reply.status(409).send(errorBody("email_taken", "该邮箱已被注册"));
      }

      let user: UserRow;
      try {
        user = createUser(app.db, {
          email,
          passwordHash: await hashPassword(password),
          displayName: displayName ?? null,
          // Pinned on purpose: admin user creation must never mint an admin
          // (docs/admin-design.md §3.2). Role management is out of scope.
          role: "user",
          pointsBalance: 0,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply
            .status(409)
            .send(errorBody("email_taken", "该邮箱已被注册"));
        }
        throw error;
      }

      // No session cookie is issued: the created user is not this request's
      // user, and sending one would hijack the acting admin's session.
      return reply.status(201).send({ user: toPublicUser(user) });
    },
  );

  app.get(
    "/admin/users",
    { preHandler: guards },
    async (request, reply) => {
      const parsed = adminUserListQuerySchema.safeParse(request.query);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const { limit, offset, q } = parsed.data;
      const { items, total } = listUsers(app.db, { limit, offset, search: q });

      return reply.send({
        items: items.map(toPublicUser),
        total,
        limit,
        offset,
      });
    },
  );
}
