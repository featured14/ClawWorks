import { test, expect, Page } from "@playwright/test";

function mockSystemCheck(page: Page, claudeStatus: "ok" | "error") {
  return page.route("**/api/system-check", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checks: [{ name: "Claude Code", status: claudeStatus }],
      }),
    })
  );
}

test.describe("Splash screen — check passes", () => {
  test.beforeEach(async ({ page }) => {
    await mockSystemCheck(page, "ok");
  });

  test("shows ready state then disclaimer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Claude Code detected")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Ready")).toBeVisible();

    // Disclaimer appears after short delay
    await expect(page.getByRole("button", { name: "Agree" })).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=may consume significant tokens")).toBeVisible();
  });

  test("clicking Agree dismisses splash screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Agree" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Agree" }).click();

    // Splash screen should be gone — disclaimer no longer visible
    await expect(page.locator("text=may consume significant tokens")).not.toBeVisible();
  });
});

test.describe("Splash screen — check fails", () => {
  test.beforeEach(async ({ page }) => {
    await mockSystemCheck(page, "error");
  });

  test("shows error card with install instructions", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("text=Claude Code not found");
    await expect(card).toBeVisible({ timeout: 5000 });

    await expect(page.locator("text=npm install -g @anthropic-ai/claude-code")).toBeVisible();
    await expect(page.locator("text=claude --version")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("copy button copies install command to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await expect(page.locator("text=Claude Code not found")).toBeVisible({ timeout: 5000 });

    const copyButtons = page.getByRole("button", { name: "Copy to clipboard" });
    await expect(copyButtons).toHaveCount(2);

    await copyButtons.first().click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("npm install -g @anthropic-ai/claude-code");
  });

  test("copy button shows checkmark after clicking", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await expect(page.locator("text=Claude Code not found")).toBeVisible({ timeout: 5000 });

    const copyButton = page.getByRole("button", { name: "Copy to clipboard" }).first();
    await expect(copyButton.locator("rect")).toBeVisible();

    await copyButton.click();
    await expect(copyButton.locator("path[d='M20 6 9 17l-5-5']")).toBeVisible();
  });

  test("retry button re-runs the check", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Claude Code not found")).toBeVisible({ timeout: 5000 });

    // Switch mock to success for the retry
    await page.unroute("**/api/system-check");
    await mockSystemCheck(page, "ok");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("text=Claude Code detected")).toBeVisible({ timeout: 5000 });
  });
});
