import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3000;
const WEB_PORT = 5173;
// Vite (dev) binds to IPv6 `[::1]`, so the browser must use `localhost` rather
// than `127.0.0.1` to reach it. The API below binds to `127.0.0.1` explicitly.
const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * End-to-end tests run against the real stack: the Vite dev server (which
 * proxies `/api` to Fastify) plus the API booted with an in-memory database and
 * a deterministic bootstrap admin.
 *
 * The servers are always started by Playwright (never reused) so the tests can
 * rely on the exact admin credentials and a fresh database below.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start -w @ukiyo-e/api",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
        DATABASE_URL: ":memory:",
        JWT_SECRET: "e2e-secret-0123456789-0123456789-abcdefgh",
        COOKIE_SECURE: "false",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "admin-password",
      },
    },
    {
      command: "npm run dev -w @ukiyo-e/web",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
