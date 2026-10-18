import {
  mockTaskDetailResponseSchema,
} from "@ukiyo-e/shared";
import type { FastifyBaseLogger } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createImage, deleteImage } from "./db/queries/images";
import {
  listWorkerTasks,
  updateTaskStatus,
} from "./db/queries/tasks";
import { removeStoredImage, storeProviderImage } from "./storage/image-storage";

const KIE_QUERY_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const POLL_TIMEOUT_MS = 30_000;

function providerData(body: unknown) {
  const parsed = mockTaskDetailResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.code !== 200 || !parsed.data.data) {
    return null;
  }
  return parsed.data.data;
}

function resultUrls(resultJson: string | null): string[] {
  if (!resultJson) throw new Error("供应商成功响应缺少图片结果");
  const parsed: unknown = JSON.parse(resultJson);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { resultUrls?: unknown }).resultUrls)
  ) {
    throw new Error("供应商图片结果格式无效");
  }
  const urls = (parsed as { resultUrls: unknown[] }).resultUrls;
  if (urls.length === 0 || urls.some((url) => typeof url !== "string")) {
    throw new Error("供应商图片结果为空");
  }
  return urls.filter((url): url is string => typeof url === "string");
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

    const data = providerData(body);
    if (!response.ok || data === null) {
      log.error({ taskId: task.id, status: response.status }, "task provider query rejected");
      continue;
    }

    const state = data.state;
    if (state === "waiting" || state === "queuing") {
      updateTaskStatus(db, task.id, "queued");
      continue;
    }
    if (state === "generating") {
      updateTaskStatus(db, task.id, "running", { started: true });
    } else if (state === "success") {
      const savedFiles: string[] = [];
      const savedImageIds: number[] = [];
      try {
        for (const [position, sourceUrl] of resultUrls(data.resultJson).entries()) {
          const stored = await storeProviderImage(task.id, position, sourceUrl);
          try {
            const image = createImage(db, {
              taskId: task.id,
              position,
              filePath: stored.filePath,
              mimeType: stored.mimeType,
              fileSize: stored.fileSize,
              sha256: stored.sha256,
              sourceUrl,
            });
            savedFiles.push(stored.filePath);
            savedImageIds.push(image.id);
          } catch (error) {
            await removeStoredImage(stored.filePath);
            throw error;
          }
        }
        updateTaskStatus(db, task.id, "succeeded");
      } catch (error) {
        await Promise.all(savedFiles.map((filePath) => removeStoredImage(filePath)));
        for (const imageId of savedImageIds) deleteImage(db, imageId);
        log.error({ err: error, taskId: task.id }, "task image storage failed");
        updateTaskStatus(db, task.id, "failed", { error: "图片保存失败" });
      }
    } else {
      updateTaskStatus(db, task.id, "failed", { error: "AI 服务生成失败" });
    }
  }
}
