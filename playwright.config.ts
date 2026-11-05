// Playwright smoke test of the judge demo path (SPEC 15, Phase 5). Runs against SMOKE_URL when
// set (for example the hosted app), otherwise starts the dev server with judge mode on and
// recorded AI results, so a local run costs nothing but sandbox payouts.

import { defineConfig, devices } from "@playwright/test";

const external = process.env.SMOKE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 5 * 60_000,
  expect: { timeout: 30_000 },
  // One retry: the first run against a cold dev server can time out while pages compile.
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? "http://localhost:3002",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: external
    ? undefined
    : {
        command: "npx next dev --port 3002",
        env: { JUDGE_MODE: "true", AI_MODE: "fixtures" },
        url: "http://localhost:3002/api/health",
        timeout: 180_000,
        reuseExistingServer: true,
      },
});
