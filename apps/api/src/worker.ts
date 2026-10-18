import {
  mockTaskDetailResponseSchema,
} from "@ukiyo-e/shared";
import type { FastifyBaseLogger } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import {
  listWorkerTasks,
  updateTaskStatus,
} from "./db/queries/tasks";

const KIE_QUERY_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const POLL_TIMEOUT_MS = 30_000;

type ProviderState = "waiting" | "queuing" | "generating" | "success" | "fail";

function providerState(body: unknown): ProviderState | null {
  const parsed = mockTaskDetailResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.code !== 200 || !parsed.data.data) {
    return null;
  }
  return parsed.data.data.state;
}

/**
 * Polls every queued/running task once. The function is intentionally
 * single-cycle so the production timer and tests share exactly the same path.
 */
export async function runTaskWorkerOnce(
  db: DatabaseSync,
  log: FastifyBaseLogger,
): Promise<void> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    log.error("KIE_API_KEY is not configured; task worker is idle");
    return;
  }

  for (const task of listWorkerTasks(db)) {
    let response: Response;
    try {
      response = await fetch(
        `${KIE_QUERY_URL}?taskId=${encodeURIComponent(task.providerTaskId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
        },
      );
    } catch (error) {
      log.error({ err: error, taskId: task.id }, "task provider polling failed");
      continue;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      log.error({ err: error, taskId: task.id }, "task provider returned invalid JSON");
      continue;
    }

    if (!response.ok || providerState(body) === null) {
      log.error({ taskId: task.id, status: response.status }, "task provider query rejected");
      continue;
    }

    const state = providerState(body);
    if (state === "waiting" || state === "queuing") {
      updateTaskStatus(db, task.id, "queued");
      continue;
    }
    if (state === "generating") {
      updateTaskStatus(db, task.id, "running", { started: true });
    } else if (state === "success") {
      updateTaskStatus(db, task.id, "succeeded");
    } else {
      updateTaskStatus(db, task.id, "failed", { error: "AI 服务生成失败" });
    }
  }
}
