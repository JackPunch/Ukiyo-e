import { expect, test, type Page } from "@playwright/test";

/** Matches the bootstrap admin configured in playwright.config.ts. */
const ADMIN = { email: "admin@example.com", password: "admin-password" };

/** Signs in through the login form and waits for the home page. */
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "Ukiyo-e" })).toBeVisible();
}

// A per-test suffix keeps emails unique, so a retry never hits a 409.
const token = () => Date.now().toString(36);

test.describe("管理员系统", () => {
  test("管理员可以创建并查找用户", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    // The admin-only entry point is visible on the home page.
    await page.getByRole("link", { name: "用户管理" }).click();
    await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();

    const suffix = token();
    const email = `alice-${suffix}@example.com`;

    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("展示名（可选）").fill("Alice");
    await page.getByLabel("密码（至少 8 位）").fill("password1234");
    await page.getByRole("button", { name: "创建用户" }).click();

    await expect(page.getByText(`已创建用户 ${email}`)).toBeVisible();

    // Find the new user by keyword.
    await page.getByPlaceholder("按邮箱或展示名查找").fill(suffix);
    await page.getByRole("button", { name: "查找" }).click();

    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Alice");
    await expect(row).toContainText("普通用户");
  });

  test("普通用户看不到也进不了管理页", async ({ page }) => {
    const email = `bob-${token()}@example.com`;

    await page.goto("/register");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码（至少 8 位）").fill("password1234");
    await page.getByRole("button", { name: "注册并登录" }).click();
    await expect(page.getByRole("heading", { name: "Ukiyo-e" })).toBeVisible();

    // No admin entry point for a regular user.
    await expect(page.getByRole("link", { name: "用户管理" })).toHaveCount(0);

    // Navigating to the admin page directly bounces back to the home page.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Ukiyo-e" })).toBeVisible();
  });
});
