import cookie from "@fastify/cookie";
import { errorBody } from "@ukiyo-e/shared";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { ensureAdminFromEnv } from "./auth/admin-bootstrap";
import { resolveAuthConfig, type AuthConfigInput } from "./auth/config";
import { createRequireAdmin, createRequireAuth } from "./auth/middleware";
import { createDatabase } from "./db/client";
import { migrate } from "./db/migrate";
import { adminUsersRoutes } from "./routes/admin-users";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { mockProviderRoutes } from "./routes/mock-provider";
import { taskRoutes } from "./routes/tasks";

declare module "fastify" {
  interface FastifyInstance {
    /** The SQLite connection, migrated and ready to query. */
    db: DatabaseSync;
  }
}

export interface BuildServerOptions {
  /** Overrides DATABASE_URL; pass `:memory:` in tests for an isolated database. */
  databaseUrl?: string;
  /** Overrides the auth environment variables; values are still validated. */
  auth?: AuthConfigInput;
}

/**
 * Builds and wires the Fastify instance.
 * Exported separately from `index.ts` so tests can use `app.inject()`
 * without binding a real port. Async because startup work (the admin
 * bootstrap) must finish before the first request is served.
 */
export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Resolving here means a missing or weak JWT_SECRET stops the process instead
  // of letting it serve traffic with a guessable key (and before we touch the
  // database).
  const authConfig = resolveAuthConfig(options.auth);

  const db = createDatabase(options.databaseUrl);
  migrate(db);

  // Decorated on the root instance so route plugins can reach `app.db`.
  app.decorate("db", db);
  app.addHook("onClose", (instance) => {
    instance.db.close();
  });

  app.decorate("authConfig", authConfig);
  app.decorateRequest("user", null);
  app.decorate("requireAuth", createRequireAuth(authConfig));
  app.decorate("requireAdmin", createRequireAdmin());

  app.register(cookie);
  await ensureAdminFromEnv(db, app.log);

  // Guarantee the shared error envelope for every non-2xx response, including
  // the ones Fastify produces on its own (see docs/api.md §3).
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody("not_found", "接口不存在"));
  });
  // `FastifyError` is annotated explicitly: `setErrorHandler<TError = unknown>`
  // has no default type to infer from, so leaving it out makes `error` unknown.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;

    if (status >= 500) {
      // Log the real cause; answer with something that leaks nothing.
      request.log.error({ err: error }, "unhandled error");
      reply.status(500).send(errorBody("internal_error", "服务器内部错误"));
      return;
    }

    // Client errors raised by Fastify itself (malformed JSON body, empty JSON
    // body, oversized payload, ...). Keep the status Fastify chose.
    reply.status(status).send(errorBody("validation_error", error.message));
  });

  app.register(healthRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api" });
  app.register(adminUsersRoutes, { prefix: "/api" });
  app.register(mockProviderRoutes, { prefix: "/api" });
  app.register(taskRoutes, { prefix: "/api" });

  return app;
}
