import { buildServer } from "./server";
import { runTaskWorkerOnce } from "./worker";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildServer();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

const workerTimer = setInterval(() => {
  void runTaskWorkerOnce(app.db, app.log);
}, 5_000);
workerTimer.unref();

// Fastify does not listen to OS signals itself, so wire SIGINT/SIGTERM to
// app.close(): that drains the server and runs the onClose hooks (e.g. closing
// the SQLite connection). The flag guards against a second signal re-entering.
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info({ signal }, "shutting down");
    app
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        app.log.error(error);
        process.exit(1);
      });
  });
}
