import { errorBody } from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import { findImageById } from "../db/queries/images";
import { findTaskById } from "../db/queries/tasks";
import { createReadStream, imageFilePath, stat } from "../storage/image-storage";

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/images/:imageId",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const imageId = Number((request.params as { imageId: string }).imageId);
      if (!Number.isSafeInteger(imageId) || imageId <= 0) {
        return reply.status(400).send(errorBody("validation_error", "图片 ID 不合法"));
      }
      const image = findImageById(app.db, imageId);
      const task = image ? findTaskById(app.db, image.task_id) : undefined;
      if (!image || !task || task.user_id !== request.user!.id) {
        return reply.status(404).send(errorBody("not_found", "图片不存在"));
      }

      try {
        const path = imageFilePath(image.file_path);
        await stat(path);
        reply
          .header("Cache-Control", "private, max-age=86400")
          .header("X-Content-Type-Options", "nosniff")
          .type(image.mime_type);
        return reply.send(createReadStream(path));
      } catch (error) {
        request.log.error({ err: error, imageId }, "stored image is unavailable");
        return reply.status(404).send(errorBody("not_found", "图片不存在"));
      }
    },
  );
}
