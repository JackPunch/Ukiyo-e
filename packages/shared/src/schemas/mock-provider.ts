import { z } from "zod";

export const mockCreateTaskRequestSchema = z.object({
  model: z.literal("nano-banana-2-1"),
  callBackUrl: z.url().optional(),
  input: z.object({
    prompt: z.string().min(1).max(20_000),
    image_input: z.array(z.url()).max(10).optional(),
    aspect_ratio: z.string().optional(),
    resolution: z.enum(["1K", "2K", "4K"]).optional(),
    output_format: z.enum(["png", "jpg"]).optional(),
  }),
});

export const mockTaskQuerySchema = z.object({
  taskId: z.string().min(1),
});

export const mockCreateTaskResponseSchema = z.object({
  code: z.literal(200),
  msg: z.string(),
  data: z.object({ taskId: z.string() }),
});

export const providerCreateTaskResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  data: z.object({ taskId: z.string() }).nullable(),
});

export const createImageTaskResponseSchema = z.object({
  taskId: z.number().int().positive(),
  providerTaskId: z.string(),
  status: z.literal("queued"),
});
export type CreateImageTaskResponse = z.infer<
  typeof createImageTaskResponseSchema
>;

export const taskStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const taskStatusResponseSchema = z.object({
  taskId: z.number().int().positive(),
  status: taskStatusSchema,
  prompt: z.string(),
  model: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type TaskStatusResponse = z.infer<typeof taskStatusResponseSchema>;

export const mockTaskDetailResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  data: z
    .object({
      taskId: z.string(),
      model: z.string(),
      state: z.enum(["waiting", "queuing", "generating", "success", "fail"]),
      param: z.string(),
      resultJson: z.string().nullable(),
      response: z
        .object({ resultUrls: z.array(z.url()) })
        .nullable()
        .optional(),
      failCode: z.string().nullable().optional(),
      failMsg: z.string().nullable().optional(),
      costTime: z.number().optional(),
      completeTime: z.number().nullable().optional(),
      createTime: z.number().optional(),
      creditsConsumed: z.number().optional(),
    })
    .nullable(),
});

export type MockCreateTaskRequest = z.infer<
  typeof mockCreateTaskRequestSchema
>;
