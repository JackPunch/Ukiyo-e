import { z } from "zod";

/**
 * Every non-2xx response from the API uses this envelope, so clients branch on
 * a stable `code` instead of matching message text.
 *
 * Full catalogue (status, meaning, when it occurs, how to react):
 * see `docs/api.md` §3.
 */
export const apiErrorCodeSchema = z.enum([
  "validation_error",
  "invalid_credentials",
  "unauthorized",
  "forbidden",
  "not_found",
  "email_taken",
  "internal_error",
]);

export const errorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().nullable(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/**
 * Builds the envelope, so neither routes nor global handlers hand-roll the
 * shape (and cannot drift from the schema).
 */
export function errorBody(
  code: ApiErrorCode,
  message: string,
  details: unknown = null,
): ErrorResponse {
  return { error: { code, message, details } };
}
