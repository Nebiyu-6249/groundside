// npm run screens
// Captures the Devpost screenshots (docs/DEMO.md section 6) as 1920x1080 PNGs in docs/screens/,
// by driving two judge demos in a real browser. Needs a server with JUDGE_MODE=true at
// SCREENS_URL (default http://localhost:3002). Sends real PayPal sandbox payouts and two live
// AI assessments (about 0.004 USD).

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.SCREENS_URL ?? "http://localhost:3002";
const OUT = path.join(process.cwd(), "docs", "screens");
const W = 1920;
const H = 1080;

async function shot(page: Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`saved docs/screens/${name}.png`);
}

async function scrollTo(page: Page, text: string | RegExp, offset = 80) {
  const el = page.getByText(text).first();
  await el.waitFor();
  await el.evaluate((n, o) => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY - o), offset);
}

async function tab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Disruption sections" }).getByRole("link", { name }).click();
  await page.waitForLoadState("networkidle");
}

async function startDemo(page: Page, scenario: "A" | "B") {
  await page.goto(`${BASE}/`);
  await page.locator(`input[name=scenario][value=${scenario}]`).check();
  await page.getByRole("button", { name: "Start the judge demo" }).click();
  await page.waitForURL(/\/ops\/disruptions\/[^?]+\?tab=evidence/, { timeout: 180_000 });
}

async function releaseSimulateAssess(page: Page) {
  await tab(page, "Assessment");
  await page.getByRole("button", { name: "Release meal allowances now" }).click();
  await page.getByText(/^Released /).waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: /Simulate passenger responses/ }).click();
  await page.getByText(/passenger\(s\) responded/).waitFor({ timeout: 180_000 });
  await page.getByRole("button", { name: "Run AI assessment" }).click();
  await page.getByText("AI recommendation. A duty manager decides.").first().waitFor({ timeout: 180_000 });
}

/** The phone-sized passenger page inside a plain frame (no device brand), centred on 1920x1080. */
async function phoneShot(url: string, name: string, browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.getByRole("heading", { name: /^Hello / }).waitFor({ timeout: 90_000 });
  await p.waitForTimeout(800);
  const screen = await p.screenshot();
  await ctx.close();
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#e9e4d8"/><rect x="${W / 2 - 215}" y="${H / 2 - 462}" width="430" height="924" rx="48" fill="#141a22"/></svg>`);
  await sharp(frame)
    .composite([{ input: await sharp(screen).resize(390, 844).png().toBuffer(), left: W / 2 - 195, top: H / 2 - 422 }])
    .png()
    .toFile(path.join(OUT, `${name}.png`));
  console.log(`saved docs/screens/${name}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Scenario A: evidence, assessment, approval, grid mid-payout, passenger page, receipts.
    const a = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    await startDemo(a, "A");
    const opsUrl = a.url();
    await scrollTo(a, "Weather timeline", 20);
    await a.waitForTimeout(1500);
    await shot(a, "2-weather-timelines");

    await releaseSimulateAssess(a);
    await scrollTo(a, "AI recommendation. A duty manager decides.", 140);
    await shot(a, "1-assessment-scenario-a");

    const ack = a.locator("input[name=acknowledge]");
    if (await ack.count()) await ack.check();
    await a.getByLabel("Type APPROVE to confirm").fill("APPROVE");
    await a.getByRole("button", { name: "Approve compensation" }).click();
    await a.getByText(/Compensation approved by Judge \(demo\)/).waitFor({ timeout: 120_000 });

    await tab(a, "Passengers");
    await a.locator(".ag-row").first().waitFor();
    await a.locator(".ag-row").getByText("Paid", { exact: true }).first().waitFor({ timeout: 180_000 });
    await a.locator(".ag-row", { hasText: "Hana Haddad" }).first().click();
    const drawer = a.getByRole("complementary", { name: /Entitlements for/ });
    await drawer.waitFor();
    // Show the compensation trace (distance to Addis Ababa, band, rule IDs; docs/DEMO.md step 5).
    const comp = drawer.locator("details", { hasText: "Compensation" });
    await comp.locator("summary").click();
    // The drawer scrolls on its own; bring the opened trace to its top.
    await comp.evaluate((d) => {
      const aside = d.closest("aside");
      if (aside) aside.scrollTop += d.getBoundingClientRect().top - aside.getBoundingClientRect().top - 8;
    });
    await a.locator(".ag-root-wrapper").evaluate((n) => window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY - 120));
    await shot(a, "3-passenger-grid-trace");

    await a.getByRole("button", { name: "Open as passenger" }).click();
    await a.waitForURL(/\/p\//, { timeout: 60_000 });
    const paxUrl = a.url();
    await phoneShot(paxUrl, "4-passenger-page-phone", browser);

    // Receipts: a hotel receipt (approved by code) and one whose lines do not add up (review).
    await a.goto(paxUrl);
    for (const label of [/Hotel night, under the cap/, /Lines sum to 12.00/]) {
      // Open the "Try a demo receipt" list (clicking its summary again would close it).
      await a.locator("details", { hasText: "Try a demo receipt" }).evaluate((d) => d.setAttribute("open", ""));
      await Promise.all([a.waitForResponse((r) => r.url().includes("/receipts/demo"), { timeout: 120_000 }), a.getByRole("button", { name: label }).click()]);
      await a.waitForTimeout(2000);
    }
    await a.goto(opsUrl.replace(/\?tab=.*/, "?tab=receipts"));
    await a.waitForLoadState("networkidle");
    await a.locator("details").evaluateAll((ds) => ds.forEach((d) => d.setAttribute("open", "")));
    await scrollTo(a, /waiting for review/, 120);
    await shot(a, "5-receipt-checks");

    // Scenario B: signed denial, meals still paid.
    const b = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    await startDemo(b, "B");
    await releaseSimulateAssess(b);
    await b.getByLabel("Reason (shown to passengers)").fill("Dense freezing fog at Milan Malpensa with runway visual range below the reference value for the whole departure window.");
    await b.locator("input[name=citations][value=REG-5-3]").check();
    await b.getByLabel(/Type your name to sign/).fill("Judge (demo)");
    await b.getByRole("button", { name: "Sign denial" }).click();
    await b.getByText(/Compensation denied by Judge \(demo\)/).waitFor({ timeout: 120_000 });
    await tab(b, "Payouts");
    await b.getByText("Paid").first().waitFor({ timeout: 180_000 });
    await b.goto(b.url().replace(/\?tab=.*/, "?tab=overview"));
    await b.getByText("Time from decision to first passenger paid").waitFor({ timeout: 60_000 });
    await b.waitForTimeout(1500);
    await shot(b, "6-scenario-b-denial-care-paid");
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
