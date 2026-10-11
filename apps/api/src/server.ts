import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createDatabase } from "./db/client";
import { migrate } from "./db/migrate";
import { healthRoutes } from "./routes/health";

declare module "fastify" {
  interface FastifyInstance {
    /** The SQLite connection, migrated and ready to query. */
    db: DatabaseSync;
  }
}

export interface BuildServerOptions {
  /** Overrides DATABASE_URL; pass `:memory:` in tests for an isolated database. */
  databaseUrl?: string;
}

/**
 * Builds and wires the Fastify instance.
 * Exported separately from `index.ts` so tests can use `app.inject()`
 * without binding a real port.
 */
export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });

  const db = createDatabase(options.databaseUrl);
  migrate(db);

  // Decorated on the root instance so route plugins can reach `app.db`.
  app.decorate("db", db);
  app.addHook("onClose", (instance) => {
    instance.db.close();
  });

  app.register(healthRoutes, { prefix: "/api" });

  return app;
}
