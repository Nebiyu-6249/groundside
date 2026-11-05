// Smoke test of the judge demo path (docs/DEMO.md section 3, SPEC 14). Real PayPal sandbox
// payouts are sent; locally the AI assessment uses the recorded result (AI_MODE=fixtures).

import { expect, test, type Page } from "@playwright/test";

async function tab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Disruption sections" }).getByRole("link", { name }).click();
}

test("a judge goes from the landing page to a paid passenger", async ({ page }) => {
  page.on("pageerror", (err) => {
    throw err;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Start the judge demo" }).click();
  await expect(page).toHaveURL(/\/ops\/disruptions\/[^?]+\?tab=evidence/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "DEMO 412" })).toBeVisible();
  await expect(page.getByText("Judge (demo)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weather timeline" })).toBeVisible();

  // Release meals before deciding, then let the scripted passengers answer.
  await tab(page, "Assessment");
  await page.getByRole("button", { name: "Release meal allowances now" }).click();
  await expect(page.getByText(/^Released /)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Simulate passenger responses/ }).click();
  await expect(page.getByText(/passenger\(s\) responded/)).toBeVisible({ timeout: 120_000 });

  // AI assessment, then approval with the typed confirmation.
  await page.getByRole("button", { name: "Run AI assessment" }).click();
  await expect(page.getByText("AI recommendation. A duty manager decides.").first()).toBeVisible({ timeout: 120_000 });
  const ack = page.getByRole("checkbox", { name: /I have reviewed the open readiness checks/ });
  if (await ack.isVisible()) await ack.check();
  await page.getByLabel("Type APPROVE to confirm").fill("APPROVE");
  await page.getByRole("button", { name: "Approve compensation" }).click();
  await expect(page.getByText(/Compensation approved by Judge \(demo\)/)).toBeVisible({ timeout: 120_000 });

  // Payouts reach PayPal and come back as Paid in the live grid.
  await tab(page, "Passengers");
  await expect(page.locator(".ag-row").first()).toBeVisible();
  await expect(page.locator(".ag-row").getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 180_000 });

  // The audit trail recorded the decision.
  await tab(page, "Audit");
  await expect(page.getByText("DECISION_APPROVE")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

test("the public pages load without errors", async ({ page }) => {
  for (const path of ["/about-data", "/demo/book", "/login"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  }
  const missing = await page.goto("/no-such-page");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
});
