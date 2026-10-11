import { z } from "zod";

/**
 * Emails are normalized to lowercase + trimmed before they are stored (the
 * query layer's `normalizeEmail` does the same), so registration and login
 * share one schema.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "邮箱格式不正确" }));

/** Lower bound is a strength requirement, upper bound keeps hashing cheap. */
export const passwordSchema = z
  .string()
  .min(8, { message: "密码至少 8 位" })
  .max(128, { message: "密码最多 128 位" });

/** Request body of `POST /api/auth/register`. */
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, { message: "展示名不能为空" })
    .max(50, { message: "展示名最多 50 字" })
    .optional(),
});

/**
 * Request body of `POST /api/auth/login`. Only "not empty" is enforced here:
 * the password rules belong to registration, and rejecting short input with a
 * 400 would leak whether a value is a plausible stored password.
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "请输入密码" }),
});

export const userRoleSchema = z.enum(["user", "admin"]);

/** How a user is exposed over HTTP; `password_hash` is never part of this. */
export const publicUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: userRoleSchema,
  pointsBalance: z.number().int(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

/** Response body of register / login / `GET /api/auth/me`. */
export const authResponseSchema = z.object({ user: publicUserSchema });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
