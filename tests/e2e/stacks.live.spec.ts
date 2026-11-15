import { expect, test } from "@playwright/test";

// Deployment-gated real Stack coverage. Set E2E_STACK_ID and NEXT_PUBLIC_STACKS_ENABLED=true on the deployed app.
const stackId = process.env.E2E_STACK_ID;
test.describe("Stage 2 lookup stack", () => {
  test.skip(!stackId, "Set E2E_STACK_ID to a published Stack before running this live test.");

  test("parent enters the fake ID and PIN and sees the result", async ({ page }) => {
    await page.goto(`/stacks/${stackId}`);
    await expect(page.getByRole("heading", { name: /exam results/i })).toBeVisible();
    await page.getByLabel(/student id|lookup id/i).fill("1001");
    await page.getByLabel(/pin/i).fill("1234");
    await page.getByRole("button", { name: /submit|lookup/i }).click();
    await expect(page.getByRole("region", { name: /lookup result/i })).toContainText(/Ada|grade|score/i);
  });

  test("wrong PIN gives one safe message and never exposes table data", async ({ page }) => {
    await page.goto(`/stacks/${stackId}`);
    await page.getByLabel(/student id|lookup id/i).fill("1001");
    await page.getByLabel(/pin/i).fill("wrong");
    await page.getByRole("button", { name: /submit|lookup/i }).click();
    await expect(page.getByRole("status")).toContainText(/could not be found|details/i);
    await expect(page.locator("body")).not.toContainText("Ada Bello");
  });
});
