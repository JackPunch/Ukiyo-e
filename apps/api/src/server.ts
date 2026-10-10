import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";

/**
 * Builds and wires the Fastify instance.
 * Exported separately from `index.ts` so tests can use `app.inject()`
 * without binding a real port.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(healthRoutes, { prefix: "/api" });

  return app;
}
