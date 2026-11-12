// Live checks of the newest features: team invites, QR poster, scheduled publish and expiry.
// Run: $env:E2E_BASE_URL="https://teletext-2-0.vercel.app"; npx playwright test features.live --project=desktop
// Uses page 449 of Greenfield High (the same page the demo-path test uses) and leaves it archived.
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.E2E_BASE_URL, "needs E2E_BASE_URL (a deployed site)");

const BASE = process.env.E2E_BASE_URL ?? "";
const EMAIL = process.env.E2E_JUDGE_EMAIL ?? "judge@example.com";
const PASSWORD = process.env.E2E_JUDGE_PASSWORD ?? "judge@example.com";
const TEST_PAGE = 449;
const MINUTE = 60_000;

/** "2026-11-12T14:30" in the machine's local time, the format of <input type="datetime-local">. */
function localInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function signIn(page: Page) {
  await page.goto("/dashboard", { waitUntil: "commit" });
  await page.waitForURL(/built-with-hexclave\.com/, { waitUntil: "commit", timeout: 90_000 });
  await page.locator('input[type="email"]').fill(EMAIL, { timeout: 45_000 });
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/teletext-2-0\.vercel\.app\/dashboard/, { timeout: 45_000, waitUntil: "commit" });
  await page.getByRole("link", { name: "Greenfield High" }).click();
  await expect(page.getByRole("heading", { name: "Greenfield High" })).toBeVisible({ timeout: 30_000 });
}

async function openTestPage(page: Page) {
  const row = page.locator("tr", { has: page.getByRole("cell", { name: String(TEST_PAGE), exact: true }) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: `P${TEST_PAGE}` })).toBeVisible({ timeout: 30_000 });
}

/** The public API with a unique query string, so the edge cache cannot hide a change. */
const publicStatus = async (page: Page) => (await page.request.get(`${BASE}/api/pages/${TEST_PAGE}?t=${Date.now()}`)).status();

test("team: the owner creates an invite code and can revoke it", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Team members" })).toContainText("owner");
  await page.getByLabel("Invite as").selectOption("viewer");
  await page.getByRole("button", { name: "Create invite" }).click();
  const shown = page.getByRole("status").filter({ hasText: "Share this now" });
  await expect(shown).toBeVisible({ timeout: 20_000 });
  await expect(shown).toContainText(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  await expect(shown).toContainText("/dashboard/join?code=");
  const open = page.getByRole("heading", { name: "Open invites" });
  await expect(open).toBeVisible();
  // Revoke every open invite. The list updates live, so a button can vanish between counting and clicking: tolerate that.
  for (let i = 0; i < 12; i++) {
    const revoke = page.getByRole("button", { name: "Revoke" }).first();
    if (!(await revoke.isVisible().catch(() => false))) break;
    await revoke.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
  await expect(page.getByRole("heading", { name: "Open invites" })).toHaveCount(0, { timeout: 15_000 });
});

test("poster: the QR code on the live poster decodes to the live page link", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await openTestPage(page);
  await page.getByRole("link", { name: "QR poster" }).click();
  await expect(page.getByRole("button", { name: "Print poster" })).toBeVisible({ timeout: 30_000 });
  const img = page.getByRole("img", { name: /QR code that opens page 449/ });
  await expect(img).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("article", { name: "Poster for page 449" })).toContainText("449");

  const src = (await img.getAttribute("src")) ?? "";
  expect(src.startsWith("data:image/png;base64,")).toBe(true);
  const png = PNG.sync.read(Buffer.from(src.split(",")[1] ?? "", "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  expect(decoded).toBe(`${BASE.replace(/\/$/, "")}/p/${TEST_PAGE}`);
});

test("schedule: a draft publishes at its time, then expires at its time", async ({ page }) => {
  test.setTimeout(540_000);
  await signIn(page);
  await openTestPage(page);

  // Start from a draft.
  const draftButton = page.getByRole("button", { name: "Move to draft" });
  if (await draftButton.isVisible().catch(() => false)) {
    await draftButton.click();
    await expect(page.getByRole("status").filter({ hasText: "Status changed to draft" })).toBeVisible({ timeout: 20_000 });
  }
  expect(await publicStatus(page)).toBe(404);

  // <input type="datetime-local"> has minute precision: publish at the minute after next, expire two minutes later.
  const publishAt = Math.ceil((Date.now() + 90_000) / MINUTE) * MINUTE;
  const expiresAt = publishAt + 2 * MINUTE;
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Schedule" }) });
  await card.getByLabel("Publish at").fill(localInput(publishAt));
  await card.getByLabel(/Expire at/).fill(localInput(expiresAt));
  const confirm = card.getByLabel(/I checked the \d+ value/);
  if (await confirm.isVisible().catch(() => false)) await confirm.check();
  await card.getByRole("button", { name: "Save schedule" }).click();
  await expect(card.getByRole("status")).toContainText("Schedule saved", { timeout: 20_000 });
  await expect(card).toContainText("Publishes");
  await expect(card).toContainText("Expires");
  expect(await publicStatus(page)).toBe(404);

  // It publishes by itself, with nobody clicking anything.
  await expect.poll(() => publicStatus(page), { timeout: 200_000, intervals: [5_000], message: "page should appear at the publish time" }).toBe(200);
  expect(Date.now()).toBeGreaterThanOrEqual(publishAt - 5_000);

  // ...and disappears at the expiry time.
  await expect.poll(() => publicStatus(page), { timeout: 240_000, intervals: [5_000], message: "page should disappear at the expiry time" }).toBe(404);
  expect(Date.now()).toBeGreaterThanOrEqual(expiresAt - 5_000);

  // The dashboard agrees: archived, with the schedule cleared.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: `P${TEST_PAGE}` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("archived", { exact: true }).first()).toBeVisible();
});
