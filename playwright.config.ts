import { defineConfig, devices } from "@playwright/test";

// Reader end-to-end tests run against a production build (the service worker only runs there).
// They read the seeded demo organizations from the Convex dev deployment in apps/web/.env.local.
// Seed once with: npm run seed --workspace @teletext/web
// Lets context.route() see requests made by the service worker, which setOffline() does not affect.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Set E2E_BASE_URL (for example https://teletext-2-0.vercel.app) to test a live site instead of a local build.
const LIVE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: LIVE ?? `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: LIVE ? undefined : {
    command: `npm run build --workspace @teletext/web && npm run start --workspace @teletext/web -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/pages/100`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
