// npm run cold-start [-- --wait-minutes=25]
// Measures a cold start of the hosted demo: optionally waits first (Render's free plan sleeps
// after 15 idle minutes), then times the landing page until it is served and the first
// "Start the judge demo" until the Evidence tab shows. A judge run only seeds data; no payouts.
// Writes docs/walkthrough/cold-start.json.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.WALKTHROUGH_URL ?? "https://groundside.onrender.com";

async function main() {
  const wait = Number(/--wait-minutes=(\d+)/.exec(process.argv.join(" "))?.[1] ?? "0");
  if (wait > 0) {
    console.log(`Waiting ${wait} min with no requests to ${BASE}`);
    await new Promise((r) => setTimeout(r, wait * 60_000));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const t0 = Date.now();
  const first = await page.goto(`${BASE}/`, { timeout: 180_000 });
  const firstStatus = first?.status() ?? 0;
  const firstMs = Date.now() - t0;
  let status = firstStatus;
  while (status !== 200 && Date.now() - t0 < 300_000) {
    await page.waitForTimeout(2000);
    status = (await page.goto(`${BASE}/`, { timeout: 180_000 }))?.status() ?? 0;
  }
  await page.getByRole("button", { name: "Start the judge demo" }).waitFor({ timeout: 120_000 });
  const landingMs = Date.now() - t0;
  const t1 = Date.now();
  await page.getByRole("button", { name: "Start the judge demo" }).click();
  await page.waitForURL(/\/ops\/disruptions\/[^?]+\?tab=evidence/, { timeout: 180_000 });
  await page.getByRole("heading", { name: "DEMO 412" }).waitFor({ timeout: 60_000 });
  const judgeMs = Date.now() - t1;
  await browser.close();
  const result = { base: BASE, at: new Date().toISOString(), idleMinutesBefore: wait, firstResponse: { status: firstStatus, seconds: +(firstMs / 1000).toFixed(1) }, landingServedSeconds: +(landingMs / 1000).toFixed(1), firstJudgeStartSeconds: +(judgeMs / 1000).toFixed(1) };
  writeFileSync(path.join(process.cwd(), "docs", "walkthrough", "cold-start.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
