import type { FastifyReply } from "fastify";
import type { ZodError } from "zod";
import { errorBody } from "@ukiyo-e/shared";

/**
 * Detects a SQLite UNIQUE violation. Routes pre-check for the common case and
 * use this to close the race where two requests insert the same unique value at
 * once, turning a 500 into the right 409.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}

/** Answers 400 with the shared error envelope and per-field zod details. */
export function sendValidationError(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send(
    errorBody(
      "validation_error",
      "请求参数不合法",
      error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    ),
  );
}
