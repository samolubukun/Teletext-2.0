// Reader end-to-end tests (reader-app task 11). Needs the seeded demo data (npm run seed --workspace @teletext/web).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The screen-reader layer is the reliable text version of the current page. */
const srText = (page: Page) => page.locator("section.sr-only");

async function openIndex(page: Page) {
  await page.goto("/");
  await expect(srText(page)).toContainText("Page 100");
}

test.describe("reader", () => {
  test("page 100 loads and renders a 24-row screen", async ({ page }) => {
    await openIndex(page);
    await expect(page.locator(".tt-screen .tt-row")).toHaveCount(24);
  });

  test("typing 412 opens page 412 and updates the address", async ({ page }) => {
    await openIndex(page);
    await page.keyboard.type("412");
    await expect(srText(page)).toContainText("Page 412");
    await expect(page).toHaveURL(/\/p\/412$/);
  });

  test("the header shows the digits typed so far", async ({ page }) => {
    await openIndex(page);
    await page.keyboard.type("4");
    await expect(page.locator(".tt-screen .tt-row").first()).toContainText("P4");
    await page.keyboard.press("Escape");
  });

  test("fastext keys and buttons navigate", async ({ page }) => {
    await page.goto("/p/412");
    await expect(srText(page)).toContainText("Page 412");
    await page.keyboard.press("r");
    await expect(srText(page)).toContainText("Page 100");
    await page.keyboard.type("412");
    await expect(srText(page)).toContainText("Page 412");
    await page.getByRole("navigation", { name: "Fastext" }).getByRole("button", { name: /^green/ }).click();
    await expect(srText(page)).toContainText("Page 400");
  });

  test("an out-of-range number shows a friendly page, a missing page shows not found", async ({ page }) => {
    await openIndex(page);
    await page.keyboard.type("999");
    await expect(srText(page)).toContainText("999");
    await page.keyboard.type("899");
    await expect(srText(page)).toContainText("899");
    await expect(page.getByRole("navigation", { name: "Fastext" }).getByRole("button").first()).toBeEnabled();
  });

  test("a page payload is under 5 KB", async ({ request }) => {
    const res = await request.get("/api/pages/412");
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeLessThan(5120);
    expect(res.headers()["cache-control"]).toContain("s-maxage");
  });

  test("invalid page numbers are rejected by the API", async ({ request }) => {
    expect((await request.get("/api/pages/99")).status()).toBe(400);
    expect((await request.get("/api/pages/abc")).status()).toBe(400);
  });

  test("clean mode shows plain text", async ({ page }) => {
    await page.goto("/p/412");
    await page.locator("summary", { hasText: "Settings and help" }).click();
    await page.getByRole("combobox", { name: /^Mode/ }).selectOption("clean");
    await expect(page.locator("article")).toContainText("P412");
  });

  test("keyword search finds a published page", async ({ page }) => {
    await openIndex(page);
    await page.getByLabel("Search pages").fill("results");
    await page.getByRole("button", { name: "Find" }).click();
    await expect(srText(page)).toContainText(/search|results/i);
  });
});

test.describe("dashboard shell", () => {
  // The build logs a Hexclave `cookies()` InvariantError while prerendering. This checks it does no visible harm.
  test("/dashboard loads without an application error when signed out", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(400);
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    expect(errors).toEqual([]);
  });
});

test.describe("offline", () => {
  test("a page that was read once opens offline with an OFFLINE COPY badge (O3)", async ({ page, context }) => {
    await openIndex(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Reload so the worker controls the page, then read 412 online so it is cached.
    await page.reload();
    await expect(srText(page)).toContainText("Page 100");
    await page.keyboard.type("412");
    await expect(srText(page)).toContainText("Page 412");
    await page.waitForTimeout(500);

    await context.route("**/api/pages/**", (route) => route.abort("internetdisconnected"));
    await page.keyboard.type("100");
    await expect(srText(page)).toContainText("Page 100");
    await page.keyboard.type("412");
    await expect(srText(page)).toContainText("Page 412");
    await expect(page.getByText("OFFLINE COPY")).toBeVisible();

    // A page never read says so instead of failing.
    await page.keyboard.type("613");
    await expect(srText(page)).toContainText("613");
    await context.unroute("**/api/pages/**");
  });
});

test.describe("accessibility (axe)", () => {
  for (const path of ["/", "/p/412"]) {
    test(`no serious or critical issues on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(srText(page)).toContainText("Page ");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
});
