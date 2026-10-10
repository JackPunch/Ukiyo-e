import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "@ukiyo-e/shared";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    // Parsing through the shared schema keeps the response in sync with the frontend.
    return healthResponseSchema.parse({
      status: "ok",
      service: "ukiyo-e-api",
      time: new Date().toISOString(),
    });
  });
}
