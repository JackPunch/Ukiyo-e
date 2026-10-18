import {
  createImageTaskResponseSchema,
  errorBody,
  mockCreateTaskRequestSchema,
  providerCreateTaskResponseSchema,
} from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import { createTask } from "../db/queries/tasks";
import { sendValidationError } from "./helpers";

const KIE_CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const KIE_TIMEOUT_MS = 30_000;

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/tasks",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const parsed = mockCreateTaskRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const apiKey = process.env.KIE_API_KEY;
      if (!apiKey) {
        request.log.error("KIE_API_KEY is not configured");
        return reply
          .status(500)
          .send(errorBody("internal_error", "服务未配置 AI 供应商"));
      }

      let providerResponse: Response;
      try {
        providerResponse = await fetch(KIE_CREATE_TASK_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parsed.data),
          signal: AbortSignal.timeout(KIE_TIMEOUT_MS),
        });
      } catch (error) {
        request.log.error({ err: error }, "AI provider request failed");
        return reply
          .status(502)
          .send(errorBody("internal_error", "AI 服务暂时不可用，请稍后重试"));
      }

      let providerBody: unknown;
      try {
        providerBody = await providerResponse.json();
      } catch (error) {
        request.log.error({ err: error }, "AI provider returned invalid JSON");
        return reply
          .status(502)
          .send(errorBody("internal_error", "AI 服务返回了无效响应"));
      }

      const providerResult =
        providerCreateTaskResponseSchema.safeParse(providerBody);
      if (
        !providerResponse.ok ||
        !providerResult.success ||
        providerResult.data.code !== 200 ||
        !providerResult.data.data
      ) {
        request.log.error(
          { status: providerResponse.status, body: providerBody },
          "AI provider rejected task",
        );
        return reply
          .status(502)
          .send(errorBody("internal_error", "AI 任务创建失败，请稍后重试"));
      }

      const providerTaskId = providerResult.data.data.taskId;
      const task = createTask(app.db, {
        userId: request.user!.id,
        prompt: parsed.data.input.prompt,
        model: parsed.data.model,
        params: { ...parsed.data, providerTaskId },
      });

      return reply.send(
        createImageTaskResponseSchema.parse({
          taskId: task.id,
          providerTaskId,
          status: task.status,
        }),
      );
    },
  );
}
