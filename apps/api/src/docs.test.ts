import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiErrorCodeSchema } from "@ukiyo-e/shared";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { resolveAuthConfig } from "./auth/config";
import { adminUsersRoutes } from "./routes/admin-users";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const apiDoc = readFileSync(join(repoRoot, "docs", "api.md"), "utf8");

/**
 * docs/api.md is the contract clients read, so drift is caught here rather than
 * in review. See AGENTS.md → 「文档同步」.
 */
async function registeredRoutes(): Promise<string[]> {
  const app = Fastify();
  const routes: string[] = [];

  // The plugins read these at registration time; no handler is ever invoked, so
  // the values only need to satisfy the shape.
  app.decorate("authConfig", resolveAuthConfig({ jwtSecret: "x".repeat(32) }, {}));
  app.decorate("requireAuth", async () => {});
  app.decorate("requireAdmin", async () => {});

  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      // Fastify adds HEAD next to every GET; that is not part of the contract.
      if (method !== "HEAD") routes.push(`${method} ${route.url}`);
    }
  });

  app.register(healthRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api" });
  app.register(adminUsersRoutes, { prefix: "/api" });
  await app.ready();
  await app.close();

  return routes.sort();
}

describe("docs/api.md", () => {
  it("documents every registered endpoint", async () => {
    const routes = await registeredRoutes();

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(apiDoc).toContain(route);
    }
  });

  it("lists exactly the error codes the schema defines", () => {
    const section = apiDoc.split("## 3. 错误码")[1]?.split("## 4.")[0] ?? "";
    // Only data rows: `| \`<code>\` | \`<status>\` | ...`, which skips the header
    // and the field-description table above it.
    const documented = [
      ...section.matchAll(/^\| `([a-z_]+)` \| `\d{3}`/gm),
    ].map((match) => match[1]);

    expect(documented.sort()).toEqual([...apiErrorCodeSchema.options].sort());
  });
});
