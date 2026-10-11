import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the **Docker deployment** instead of the dev servers.
 *
 * This config has no `webServer`: the stack must be running already, because the
 * images are built from the repo (nginx serves the built SPA on :8080 and
 * proxies `/api` to the `api` container). Typical cycle:
 *
 *   docker compose up --build -d
 *   npm run test:e2e:docker
 *   docker compose down -v
 *
 * Override the entry point with `E2E_BASE_URL` (e.g. a remote host).
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
