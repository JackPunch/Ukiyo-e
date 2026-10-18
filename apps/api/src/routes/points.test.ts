import { afterEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/cookie";
import { recordPointTransaction } from "../db/queries/point-transactions";
import { buildTestServer } from "../test-support";

describe("GET /api/points/transactions", () => {
  afterEach(() => {});

  it("returns only the current user's transactions", async () => {
    const app = await buildTestServer();
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "points-a@example.com", password: "password1234" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "points-b@example.com", password: "password1234" },
    });
    recordPointTransaction(app.db, {
      userId: first.json().user.id,
      amount: 5,
      reason: "admin_adjust",
      note: "奖励",
    });
    recordPointTransaction(app.db, {
      userId: second.json().user.id,
      amount: 9,
      reason: "admin_adjust",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/points/transactions",
      cookies: { [SESSION_COOKIE_NAME]: first.cookies[0]!.value },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      items: [{ amount: 5, balanceAfter: 5, reason: "admin_adjust", note: "奖励" }],
    });
    await app.close();
  });
});
