import { z } from "zod";

export const taskListQuerySchema = z.object({
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
});

export const taskHistoryItemSchema = z.object({
  taskId: z.number().int().positive(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  prompt: z.string(),
  model: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const taskListResponseSchema = z.object({
  items: z.array(taskHistoryItemSchema),
  total: z.number().int().min(0),
  limit: z.number().int().positive(),
  offset: z.number().int().min(0),
});

export type TaskHistoryItem = z.infer<typeof taskHistoryItemSchema>;
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
