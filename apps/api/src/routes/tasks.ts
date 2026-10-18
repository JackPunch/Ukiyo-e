import {
  createImageTaskResponseSchema,
  errorBody,
  mockCreateTaskRequestSchema,
  providerCreateTaskResponseSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskStatusResponseSchema,
} from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import {
  createTask,
  deleteTask,
  findTaskById,
  listTasks,
  setTaskProviderTaskId,
  updateTaskStatus,
} from "../db/queries/tasks";
import { listImagesByTask } from "../db/queries/images";
import {
  InsufficientPointsError,
  recordPointTransaction,
} from "../db/queries/point-transactions";
import { sendValidationError } from "./helpers";

const KIE_CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const KIE_TIMEOUT_MS = 30_000;
const TASK_POINTS_COST = 1;

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/tasks",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const parsed = taskListQuerySchema.safeParse(request.query);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const { limit, offset } = parsed.data;
      const result = listTasks(app.db, {
        userId: request.user!.id,
        limit,
        offset,
      });

      return reply.send(
        taskListResponseSchema.parse({
          items: result.items.map((task) => ({
            taskId: task.id,
            status: task.status === "canceled" ? "failed" : task.status,
            prompt: task.prompt,
            model: task.model,
            error: task.error,
            createdAt: task.created_at,
            updatedAt: task.updated_at,
            finishedAt: task.finished_at,
          })),
          total: result.total,
          limit,
          offset,
        }),
      );
    },
  );

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

      const task = createTask(app.db, {
        userId: request.user!.id,
        prompt: parsed.data.input.prompt,
        model: parsed.data.model,
        params: parsed.data,
        pointsCost: TASK_POINTS_COST,
      });
      try {
        recordPointTransaction(app.db, {
          userId: request.user!.id,
          amount: -TASK_POINTS_COST,
          reason: "task_spend",
          refType: "task",
          refId: task.id,
        });
      } catch (error) {
        deleteTask(app.db, task.id);
        if (error instanceof InsufficientPointsError) {
          return reply
            .status(400)
            .send(errorBody("insufficient_points", "积分余额不足"));
        }
        throw error;
      }

      const refundTask = () => {
        updateTaskStatus(app.db, task.id, "failed", {
          error: "AI 任务创建失败",
        });
        recordPointTransaction(app.db, {
          userId: request.user!.id,
          amount: TASK_POINTS_COST,
          reason: "task_refund",
          refType: "task",
          refId: task.id,
        });
      };

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
        refundTask();
        return reply
          .status(502)
          .send(errorBody("internal_error", "AI 服务暂时不可用，请稍后重试"));
      }

      let providerBody: unknown;
      try {
        providerBody = await providerResponse.json();
      } catch (error) {
        request.log.error({ err: error }, "AI provider returned invalid JSON");
        refundTask();
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
        refundTask();
        return reply
          .status(502)
          .send(errorBody("internal_error", "AI 任务创建失败，请稍后重试"));
      }

      const providerTaskId = providerResult.data.data.taskId;
      setTaskProviderTaskId(app.db, task.id, providerTaskId);

      return reply.send(
        createImageTaskResponseSchema.parse({
          taskId: task.id,
          providerTaskId,
          status: task.status,
        }),
      );
    },
  );

  app.get(
    "/tasks/:taskId",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const taskId = Number((request.params as { taskId: string }).taskId);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) {
        return reply
          .status(400)
          .send(errorBody("validation_error", "任务 ID 不合法"));
      }

      const task = findTaskById(app.db, taskId);
      if (!task || task.user_id !== request.user!.id) {
        return reply.status(404).send(errorBody("not_found", "任务不存在"));
      }

      return reply.send(
        taskStatusResponseSchema.parse({
          taskId: task.id,
          status: task.status === "canceled" ? "failed" : task.status,
          prompt: task.prompt,
          model: task.model,
          error: task.error,
          createdAt: task.created_at,
          updatedAt: task.updated_at,
          startedAt: task.started_at,
          finishedAt: task.finished_at,
          images: listImagesByTask(app.db, task.id).map((image) => ({
            imageId: image.id,
            position: image.position,
            url: `/api/images/${image.id}`,
            mimeType: image.mime_type,
            width: image.width,
            height: image.height,
            fileSize: image.file_size,
          })),
        }),
      );
    },
  );
}
