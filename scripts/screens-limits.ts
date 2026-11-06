// npm run screens:limits -- --mode=cap|balance
// Shows what a judge sees when payouts are held (docs/screens/limit-*.png):
//   cap:     run the server with a tiny PAYOUT_DAILY_CAP_EUR, so the first payouts are held.
//   balance: this script records a batch refused with INSUFFICIENT_FUNDS (as PayPal reports when
//            the sandbox balance is too low), captures, and removes it again. The sandbox balance
//            itself cannot be drained on demand, so this state is simulated in the database.
// Needs a server with JUDGE_MODE=true at SCREENS_URL (default http://localhost:3002).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { getDb } from "../src/lib/db";
import { INSUFFICIENT_FUNDS } from "../src/lib/payouts/limits";

const BASE = process.env.SCREENS_URL ?? "http://localhost:3002";
const OUT = path.join(process.cwd(), "docs", "screens");
const mode = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] === "balance" ? "balance" : "cap";

async function tab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Disruption sections" }).getByRole("link", { name }).click();
  await page.waitForLoadState("networkidle");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const db = getDb();
  const fake = mode === "balance"
    ? await db.payoutBatch.create({ data: { senderBatchId: `gs-simulated-balance-${Date.now()}`, kind: "MEAL", status: "FAILED_TO_CREATE", itemCount: 0, totalCents: 0, lastError: `${INSUFFICIENT_FUNDS}: simulated for the screenshot (scripts/screens-limits.ts)` } })
    : null;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await page.goto(`${BASE}/`);
    await page.getByRole("button", { name: "Start the judge demo" }).click();
    await page.waitForURL(/\/ops\/disruptions\/[^?]+\?tab=evidence/, { timeout: 180_000 });
    const opsUrl = page.url();
    await tab(page, "Assessment");
    await page.getByRole("button", { name: "Release meal allowances now" }).click();
    await page.getByText(/^Released /).waitFor({ timeout: 90_000 });
    await page.getByRole("button", { name: /Simulate passenger responses/ }).click();
    await page.getByText(/passenger\(s\) responded/).waitFor({ timeout: 180_000 });
    // The rest of the demo keeps working while payouts are held.
    await page.getByRole("button", { name: "Run AI assessment" }).click();
    await page.getByText("AI recommendation. A duty manager decides.").first().waitFor({ timeout: 180_000 });
    await page.goto(opsUrl.replace(/\?tab=.*/, "?tab=payouts"));
    await page.getByText("Payouts paused.").waitFor({ timeout: 60_000 });
    await page.getByText("Payouts paused.").evaluate((n) => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY - 400));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `limit-${mode}-ops.png`) });
    console.log(`saved docs/screens/limit-${mode}-ops.png`);

    await tab(page, "Passengers");
    await page.locator(".ag-row", { hasText: "Mateo Oliveira" }).first().click();
    await page.getByRole("button", { name: "Open as passenger" }).click();
    await page.waitForURL(/\/p\//, { timeout: 60_000 });
    const pax = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await pax.goto(page.url());
    await pax.getByText(/Your payment is approved and queued/).waitFor({ timeout: 60_000 });
    await pax.getByText(/Your payment is approved and queued/).evaluate((n) => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY - 300));
    await pax.waitForTimeout(800);
    await pax.screenshot({ path: path.join(OUT, `limit-${mode}-passenger.png`) });
    console.log(`saved docs/screens/limit-${mode}-passenger.png`);
  } finally {
    await browser.close();
    if (fake) await db.payoutBatch.delete({ where: { id: fake.id } });
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
