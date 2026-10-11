import { z } from "zod";
import { emailSchema, passwordSchema, publicUserSchema } from "./auth";

/**
 * Request body of `POST /api/admin/users` (docs/admin-design.md §3.2).
 * Same field rules as registration — the admin is opening an account on the
 * user's behalf, not inventing new constraints.
 */
export const adminCreateUserRequestSchema = z.object({
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
 * Query of `GET /api/admin/users` (docs/admin-design.md §3.3). HTTP query values
 * are strings, so numbers are coerced; `q` is trimmed and an empty string means
 * "no filter" rather than "match everything".
 */
export const adminUserListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int({ message: "limit 必须是整数" })
    .min(1, { message: "limit 至少为 1" })
    .max(100, { message: "limit 最多为 100" })
    .default(20),
  offset: z.coerce
    .number()
    .int({ message: "offset 必须是整数" })
    .min(0, { message: "offset 不能为负数" })
    .default(0),
  q: z
    .string()
    .trim()
    .max(100, { message: "关键词最多 100 字" })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/**
 * Response body of `GET /api/admin/users`. Echoes the effective `limit`/`offset`
 * (after defaults and clamping) so the client can render paging controls.
 */
export const adminUserListResponseSchema = z.object({
  items: z.array(publicUserSchema),
  total: z.number().int().min(0),
  limit: z.number().int().positive(),
  offset: z.number().int().min(0),
});

export type AdminCreateUserRequest = z.infer<typeof adminCreateUserRequestSchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;
