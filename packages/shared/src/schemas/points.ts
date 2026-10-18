import { z } from "zod";

export const pointTransactionReasonSchema = z.enum([
  "signup_bonus",
  "task_spend",
  "task_refund",
  "admin_adjust",
]);

export const pointTransactionSchema = z.object({
  id: z.number().int().positive(),
  amount: z.number().int(),
  balanceAfter: z.number().int().nonnegative(),
  reason: pointTransactionReasonSchema,
  refType: z.string().nullable(),
  refId: z.number().int().positive().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const pointTransactionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const pointTransactionListResponseSchema = z.object({
  items: z.array(pointTransactionSchema),
  total: z.number().int().min(0),
  limit: z.number().int().positive(),
  offset: z.number().int().min(0),
});

export type PointTransactionListQuery = z.infer<
  typeof pointTransactionListQuerySchema
>;
export type PointTransactionListResponse = z.infer<
  typeof pointTransactionListResponseSchema
>;
