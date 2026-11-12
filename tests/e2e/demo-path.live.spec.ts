// Demo path against a LIVE site: sign in as the judge, paste, condense (real Gemini call), publish, read, archive.
// Run: $env:E2E_BASE_URL="https://teletext-2-0.vercel.app"; npx playwright test demo-path --project=desktop
// It reuses one page titled "E2E demo path" in Greenfield High and archives it at the end, so it never fills the range.
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_BASE_URL, "needs E2E_BASE_URL (a deployed site)");

const EMAIL = process.env.E2E_JUDGE_EMAIL ?? "judge@example.com";
const PASSWORD = process.env.E2E_JUDGE_PASSWORD ?? "judge@example.com";
const TITLE = "E2E demo path";
const SOURCE = `Dear parents,
The Term 1 reports for JSS3 will be ready on Friday 13 November 2026.
Collect them in the Main Hall between 9am and 3pm. Please bring your child's ID card.
Outstanding fees of N2,500 must be cleared first.
Call the school office on 0800 000 0000.
Mrs Adaeze Okafor, Principal`;

test("sign in, condense, publish, read, archive", async ({ page, browser }) => {
  test.setTimeout(240_000);

  // 1. Sign in through Hexclave's hosted page (it never fires a load event, so wait for the form).
  await page.goto("/dashboard", { waitUntil: "commit" });
  await page.waitForURL(/built-with-hexclave\.com/, { waitUntil: "commit", timeout: 30_000 });
  await page.locator('input[type="email"]').fill(EMAIL, { timeout: 45_000 });
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  // The redirect chain can abort an in-flight navigation, so do not wait for "load" here.
  await page.waitForURL(/teletext-2-0\.vercel\.app\/dashboard/, { timeout: 45_000, waitUntil: "commit" });

  // 2. The judge account owns Greenfield High.
  await expect(page.getByRole("link", { name: "Greenfield High" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Greenfield High" }).click();
  await expect(page.getByRole("heading", { name: "Greenfield High" })).toBeVisible();
  await expect(page.getByText("Your pages: 400-449")).toBeVisible();

  // 3. Open the reusable test page, or create it.
  const existing = page.getByRole("link", { name: TITLE, exact: false }).first();
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
  } else {
    await page.getByLabel("Title").fill(TITLE);
    await page.getByRole("button", { name: "Create page" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: /^P\d{3}$/ })).toBeVisible({ timeout: 30_000 });
  const number = (await page.getByRole("heading", { level: 1, name: /^P\d{3}$/ }).innerText()).slice(1);

  // 4. Paste and condense with the real AI service.
  await page.locator("#source").fill(SOURCE);
  await page.getByRole("button", { name: "Condense with AI" }).click();
  await expect(page.getByRole("status")).toContainText("Draft ready", { timeout: 90_000 });
  await expect(page.getByText("Fact guard")).toBeVisible();

  // 5. Publish. An archived page must go back to draft first. Confirm unchecked values if the guard asks.
  const confirm = page.getByLabel(/I checked the \d+ value/);
  if (await confirm.isVisible().catch(() => false)) await confirm.check();
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  if (!(await publish.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Move to draft" }).click();
    await expect(page.getByRole("status")).toContainText("Status changed to draft");
  }
  await expect(publish).toBeEnabled({ timeout: 15_000 });
  await publish.click();
  await expect(page.getByRole("status")).toContainText(`Published. Readers can type ${number} now.`, { timeout: 30_000 });

  // 6. A reader (no login: fresh context) sees it. A CDN may serve a cached 404 for up to ~30 s, so retry.
  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await readerPage.goto(`${process.env.E2E_BASE_URL}/p/${number}`);
  await expect(async () => {
    await readerPage.reload();
    await expect(readerPage.locator("section.sr-only")).toContainText("Main Hall", { timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [3_000] });
  await expect(readerPage.locator("section.sr-only")).toContainText("N2,500");
  await reader.close();

  // 7. Version history: the page has several versions; restoring an older one creates a new version.
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  const restoreButtons = page.getByRole("button", { name: /^Restore version \d+$/ });
  await expect(restoreButtons.first()).toBeVisible({ timeout: 15_000 });
  const label = (await restoreButtons.last().getAttribute("aria-label")) ?? "";
  const oldVersion = label.match(/\d+/)?.[0];
  await restoreButtons.last().click();
  await expect(page.getByRole("status")).toContainText(`Restored version ${oldVersion} as new version`);

  // 8. Clean up so the plan limit and the public index stay tidy.
  await page.getByRole("button", { name: "Archive (unpublish)" }).click();
  await expect(page.getByRole("status")).toContainText("Status changed to archived");
});
