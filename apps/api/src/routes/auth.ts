import { errorBody, loginRequestSchema, registerRequestSchema } from "@ukiyo-e/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { clearSessionCookie, setSessionCookie } from "../auth/cookie";
import { dummyPasswordHash, hashPassword, verifyPassword } from "../auth/password";
import { toPublicUser } from "../auth/public-user";
import { signSessionToken } from "../auth/token";
import {
  findUserByEmail,
  registerUser,
  updateUserLastLogin,
  type UserRow,
} from "../db/queries/users";
import { isUniqueViolation, sendValidationError } from "./helpers";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { authConfig } = app;

  /** Signs a session token and attaches it as an httpOnly cookie. */
  async function startSession(reply: FastifyReply, user: UserRow): Promise<void> {
    const token = await signSessionToken(user.id, authConfig);
    setSessionCookie(reply, token, authConfig);
  }

  app.post("/auth/register", async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const { email, password, displayName } = parsed.data;
    if (findUserByEmail(app.db, email)) {
      return reply.status(409).send(errorBody("email_taken", "该邮箱已被注册"));
    }

    let user: UserRow;
    try {
      user = registerUser(app.db, {
        email,
        passwordHash: await hashPassword(password),
        displayName: displayName ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send(errorBody("email_taken", "该邮箱已被注册"));
      }
      throw error;
    }

    // Registration logs the user in straight away (docs/auth-design.md §6.2).
    await startSession(reply, user);
    return reply.status(201).send({ user: toPublicUser(user) });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const { email, password } = parsed.data;
    const user = findUserByEmail(app.db, email);
    // Hash a dummy value when the email is unknown, so both failure paths cost
    // about the same (docs/auth-design.md §6.3).
    const storedHash = user?.password_hash ?? (await dummyPasswordHash());
    const passwordMatches = await verifyPassword(storedHash, password);

    if (!user || !passwordMatches) {
      return reply
        .status(401)
        .send(errorBody("invalid_credentials", "邮箱或密码不正确"));
    }

    const loggedIn = updateUserLastLogin(app.db, user.id) ?? user;
    await startSession(reply, loggedIn);
    return reply.send({ user: toPublicUser(loggedIn) });
  });

  app.post("/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply, authConfig);
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: app.requireAuth }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
