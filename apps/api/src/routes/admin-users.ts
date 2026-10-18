import {
  adminCreateUserRequestSchema,
  adminAdjustPointsRequestSchema,
  adminAdjustPointsResponseSchema,
  adminUserListQuerySchema,
  errorBody,
} from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import { hashPassword } from "../auth/password";
import { toPublicUser } from "../auth/public-user";
import {
  createUser,
  findUserByEmail,
  findUserById,
  listUsers,
  type UserRow,
} from "../db/queries/users";
import {
  InsufficientPointsError,
  recordPointTransaction,
} from "../db/queries/point-transactions";
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

  app.patch(
    "/admin/users/:userId/points",
    { preHandler: guards },
    async (request, reply) => {
      const userId = Number((request.params as { userId: string }).userId);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return reply
          .status(400)
          .send(errorBody("validation_error", "用户 ID 不合法"));
      }

      const parsed = adminAdjustPointsRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const user = findUserById(app.db, userId);
      if (!user) {
        return reply.status(404).send(errorBody("not_found", "用户不存在"));
      }

      let transaction;
      try {
        transaction = recordPointTransaction(app.db, {
          userId,
          amount: parsed.data.amount,
          reason: "admin_adjust",
          note: parsed.data.note ?? null,
          createdBy: request.user!.id,
        });
      } catch (error) {
        if (error instanceof InsufficientPointsError) {
          return reply
            .status(400)
            .send(errorBody("insufficient_points", "用户积分余额不足"));
        }
        throw error;
      }

      const updatedUser = findUserById(app.db, userId);
      if (!updatedUser) {
        throw new Error(`User disappeared after points adjustment: ${userId}`);
      }

      return reply.send(
        adminAdjustPointsResponseSchema.parse({
          user: toPublicUser(updatedUser),
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            balanceAfter: transaction.balance_after,
            reason: transaction.reason,
            note: transaction.note,
            createdAt: transaction.created_at,
          },
        }),
      );
    },
  );
}
