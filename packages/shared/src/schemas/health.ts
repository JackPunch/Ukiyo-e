import { z } from "zod";

/** Response body of `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
