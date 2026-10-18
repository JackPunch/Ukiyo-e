import {
  mockCreateTaskRequestSchema,
  mockCreateTaskResponseSchema,
  mockTaskDetailResponseSchema,
  mockTaskQuerySchema,
  type MockCreateTaskRequest,
} from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { sendValidationError } from "./helpers";

interface MockTask {
  request: MockCreateTaskRequest;
  createdAt: number;
  queryCount: number;
}

function taskDetail(taskId: string, task: MockTask) {
  const isComplete = task.queryCount > 1;
  const state = isComplete ? "success" : "generating";
  const completeTime = isComplete ? task.createdAt + 1_000 : null;
  const resultUrls = [
    `https://mock.invalid/generated/${encodeURIComponent(taskId)}.jpg`,
  ];

  return {
    code: 200,
    msg: "success",
    data: {
      taskId,
      model: task.request.model,
      state,
      param: JSON.stringify(task.request),
      resultJson: isComplete ? JSON.stringify({ resultUrls }) : null,
      response: isComplete ? { resultUrls } : null,
      failCode: null,
      failMsg: null,
      costTime: isComplete ? 1 : 0,
      completeTime,
      createTime: task.createdAt,
      creditsConsumed: isComplete ? 4 : 0,
    },
  };
}

/**
 * Emulates the Kie.ai task API without making external requests or spending
 * credits. Each task is generating on its first query and succeeds on the
 * second, making polling behavior deterministic in tests.
 */
export async function mockProviderRoutes(app: FastifyInstance): Promise<void> {
  const tasks = new Map<string, MockTask>();

  app.post("/mock/jobs/createTask", async (request, reply) => {
    const parsed = mockCreateTaskRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const taskId = `mock_${randomUUID().replaceAll("-", "")}`;
    tasks.set(taskId, {
      request: parsed.data,
      createdAt: Date.now(),
      queryCount: 0,
    });

    return reply.send(
      mockCreateTaskResponseSchema.parse({
        code: 200,
        msg: "success",
        data: { taskId },
      }),
    );
  });

  app.get("/mock/jobs/recordInfo", async (request, reply) => {
    const parsed = mockTaskQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const task = tasks.get(parsed.data.taskId);
    if (!task) {
      return reply.send({
        code: 422,
        msg: "Task not found",
        data: null,
      });
    }

    task.queryCount += 1;
    return reply.send(
      mockTaskDetailResponseSchema.parse(
        taskDetail(parsed.data.taskId, task),
      ),
    );
  });
}
