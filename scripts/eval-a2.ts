// npm run eval:a2
// Runs A2 (receipt reading) on the synthetic receipts in fixtures/receipts-synthetic/ and on the
// owner's photos in fixtures/receipts/ that have a sidecar with expected values. Compares each
// reading with the sidecar, records readings as fallbacks (fixtures/ai/a2/<sha256>.json) and
// writes docs/EVAL_A2.md. Uses the live model and costs a few cents.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readReceipt, a2FixturePath, A2_PROMPT_VERSION } from "../src/lib/ai/a2/extract";
import type { A2Output } from "../src/lib/ai/a2/schema";
import { aiConfig } from "../src/lib/ai/config";
import { openAiCaller } from "../src/lib/ai/provider";
import { memorySpendLog } from "../src/lib/ai/spend";
import { hammingDistance, NEAR_DUPLICATE_DISTANCE, processReceiptImage } from "../src/lib/receipts/image";
import { checkReceipt, type ReceiptOutcome } from "../src/lib/receipts/checks";
import { loadAirports, loadPolicy } from "../src/lib/demo/seed";
import { loadScenario, resolveTimes, type ScenarioKey } from "../src/lib/demo/scenarios";

interface DecisionSpec {
  scenario: ScenarioKey | null;
  remainingCents: { MEAL: number; HOTEL: number; TRANSPORT: number };
  expected: "AUTO_APPROVED" | "HUMAN_REVIEW" | "REJECTED";
  approvedCents: number;
  why: string;
  typicalPassenger: string;
}

const policy = loadPolicy();
const airports = new Map(loadAirports().map((a) => [a.icao, a]));
/** The receipt window of a scenario (SPEC 8.2): 2 h before departure to 1 h after the new departure. */
function scenarioWindow(key: ScenarioKey) {
  const s = loadScenario(key);
  const t = resolveTimes(s, airports);
  return {
    startUtc: new Date(t.schedDep.getTime() - policy.receiptWindowBeforeSchedDepMinutes * 60_000),
    endUtc: new Date(t.reroutingDep.getTime() + policy.receiptWindowAfterNewDepMinutes * 60_000),
    tz: airports.get(s.flight.origin)!.tz,
  };
}

function decide(reading: A2Output | null, img: { sha256: string; dHash: string }, spec: DecisionSpec, prior: { sha256: string; dHash: string; reading: A2Output | null }[]): ReceiptOutcome {
  return checkReceipt({
    reading,
    sha256: img.sha256,
    dHash: img.dHash,
    prior: prior.map((p, i) => ({ id: `prior-${i}`, sha256: p.sha256, dHash: p.dHash, merchantName: p.reading?.merchantName ?? null, total: p.reading?.total ?? null, date: p.reading?.date ?? null, time: p.reading?.time ?? null })),
    nearDuplicateDistance: NEAR_DUPLICATE_DISTANCE,
    distance: hammingDistance,
    window: scenarioWindow(spec.scenario ?? "A"),
    demoDateOverride: null,
    excludedCategories: new Set(["ALCOHOL", "TOBACCO", "DUTY_FREE"]),
    fxToEur: policy.fxRates.toEur,
    remainingCents: spec.remainingCents,
  });
}

interface Expected {
  merchantName: string;
  date: string;
  time: string;
  currency: string;
  total: number;
  lineItems: { description: string; amount: number; category: string }[];
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function compare(o: A2Output | null, e: Expected) {
  if (!o) return { pass: false, notes: ["no reading"] };
  const notes: string[] = [];
  if (o.total === null || Math.abs(o.total - e.total) > 0.005) notes.push(`total ${o.total} vs ${e.total}`);
  if (o.date !== e.date) notes.push(`date ${o.date} vs ${e.date}`);
  if (o.time !== e.time) notes.push(`time ${o.time} vs ${e.time}`);
  if (o.currency !== e.currency) notes.push(`currency ${o.currency} vs ${e.currency}`);
  if (o.lineItems.length !== e.lineItems.length) notes.push(`${o.lineItems.length} lines vs ${e.lineItems.length}`);
  else {
    e.lineItems.forEach((l, i) => {
      const got = o.lineItems[i];
      if (Math.abs(got.amount - l.amount) > 0.005) notes.push(`line ${i + 1} amount ${got.amount} vs ${l.amount}`);
      if (got.category !== l.category) notes.push(`line ${i + 1} category ${got.category} vs ${l.category}`);
    });
  }
  return { pass: notes.length === 0, notes };
}

async function main() {
  const config = aiConfig();
  if (!config.apiKey) throw new Error("OPENAI_API_KEY is not set");
  const caller = openAiCaller(config.apiKey);
  const spend = memorySpendLog();
  const dirs = ["receipts-synthetic", "receipts"].map((d) => path.join(process.cwd(), "fixtures", d)).filter(existsSync);
  const rows: string[] = [];
  const decisionRows: string[] = [];
  let passed = 0;
  let total = 0;
  let decisionsPassed = 0;
  let decisionsTotal = 0;
  let firstSample: { file: string; bytes: Buffer; spec: DecisionSpec; reading: A2Output | null; sha256: string; dHash: string } | null = null;
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((f) => MIME[path.extname(f).toLowerCase()]).sort()) {
      const sidecar = path.join(dir, `${path.basename(file, path.extname(file))}.json`);
      if (!existsSync(sidecar)) continue;
      const meta = JSON.parse(readFileSync(sidecar, "utf8")) as { expected: Expected; decision?: DecisionSpec; readingMayBeUncertain?: boolean };
      const expected = meta.expected;
      const img = await processReceiptImage(readFileSync(path.join(dir, file)), MIME[path.extname(file).toLowerCase()]);
      const r = await readReceipt({ jpeg: img.jpeg, sha256: img.sha256, scenarioContext: "" }, { config, caller, spend });
      const c = compare(r.output, expected);
      // A receipt made to be hard to read passes the reading check when the model says so
      // (LOW confidence or a missing value) rather than guessing.
      const uncertain = !!r.output && (Object.values(r.output.confidence).includes("LOW") || r.output.total === null);
      const readingPass = meta.readingMayBeUncertain ? c.pass || uncertain : c.pass;
      total++;
      if (readingPass) passed++;
      if (meta.decision) {
        const outcome = decide(r.output, img, meta.decision, []);
        const ok = outcome.decision === meta.decision.expected && (outcome.decision !== "AUTO_APPROVED" || outcome.approvedCents === meta.decision.approvedCents);
        decisionsTotal++;
        if (ok) decisionsPassed++;
        decisionRows.push(`| ${file} | ${meta.decision.expected}${meta.decision.approvedCents ? ` ${(meta.decision.approvedCents / 100).toFixed(2)}` : ""} | ${outcome.decision}${outcome.approvedCents ? ` ${(outcome.approvedCents / 100).toFixed(2)}` : ""} | ${ok ? "pass" : "fail"} | ${outcome.reason.replaceAll("|", "/")} | ${meta.decision.typicalPassenger} |`);
        console.log(`  decision ${ok ? "pass" : "FAIL"}: expected ${meta.decision.expected}, got ${outcome.decision} (${outcome.reason})`);
        if (!firstSample) firstSample = { file, bytes: readFileSync(path.join(dir, file)), spec: meta.decision, reading: r.output, sha256: img.sha256, dHash: img.dHash };
      }
      if (r.output && !r.usedFixture) {
        mkdirSync(path.dirname(a2FixturePath(img.sha256)), { recursive: true });
        writeFileSync(a2FixturePath(img.sha256), JSON.stringify({ recordedAt: new Date().toISOString(), model: r.model, promptVersion: A2_PROMPT_VERSION, source: `${path.basename(dir)}/${file}`, output: r.output }, null, 2) + "\n");
      }
      const lowNote = uncertain ? ` (model reported low confidence: ${Object.entries(r.output!.confidence).filter(([, v]) => v === "LOW").map(([k]) => k).join(", ") || "total missing"})` : "";
      rows.push(`| ${path.basename(dir)}/${file} | ${readingPass ? "pass" : "fail"} | ${(c.notes.join("; ") || "all fields match") + lowNote} | ${r.retries} | ${r.costUsd.toFixed(5)} |`);
      console.log(`${readingPass ? "pass" : "FAIL"} ${file}${c.notes.length ? `: ${c.notes.join("; ")}` : ""}${lowNote}`);
    }
  }
  // Duplicate test: the first sample receipt uploaded again must be rejected as a duplicate.
  if (firstSample) {
    const again = decide(firstSample.reading, firstSample, firstSample.spec, [{ sha256: firstSample.sha256, dHash: firstSample.dHash, reading: firstSample.reading }]);
    const ok = again.decision === "REJECTED" && again.checks.some((ch) => ch.id === "duplicate" && !ch.ok);
    decisionsTotal++;
    if (ok) decisionsPassed++;
    decisionRows.push(`| ${firstSample.file} (uploaded again) | REJECTED (duplicate) | ${again.decision} | ${ok ? "pass" : "fail"} | ${again.reason} | same for every passenger |`);
    console.log(`  duplicate ${ok ? "pass" : "FAIL"}: ${again.decision} (${again.reason})`);
  }
  const cost = spend.calls.reduce((s, x) => s + x.costUsd, 0);
  const report = [
    "# Eval report: A2 receipt reading",
    "",
    `Generated by \`npm run eval:a2\` on ${new Date().toISOString()}. Model \`${config.models.A2}\`, prompt \`${A2_PROMPT_VERSION}\`.`,
    "",
    "All receipts here are **synthetic samples, not real receipts**:",
    "- `fixtures/receipts/`: photo-style samples made by `scripts/make-receipts.ts`, with invented merchants and zeroed tax IDs, phones and card digits; each prints \"Sample receipt - Groundside demo\".",
    "- `fixtures/receipts-synthetic/`: plain test images made by `scripts/make-synthetic-receipts.ts`.",
    "",
    "Expected values come from the generator source, not from the AI.",
    "",
    "## Reading",
    "",
    "A case passes when total, date, time, currency, every line amount and every line category match the source. For the deliberately faded receipt, it also passes when the model reports low confidence instead of guessing.",
    "",
    `Result: ${passed} of ${total} pass. Cost of this run: ${cost.toFixed(4)} USD (estimated from token counts).`,
    "",
    "| Receipt | Result | Notes | Retries | Cost (USD) |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "## Decision (code checks on the AI reading)",
    "",
    "The decision comes from `src/lib/receipts/checks.ts`, never from the AI. It uses the scenario's real receipt window and a passenger who still has 45 EUR of meal allowance plus unused hotel and transport caps (for example a passenger who chose a refund). The last column says what a typical passenger gets under the current meal rule.",
    "",
    `Result: ${decisionsPassed} of ${decisionsTotal} pass.`,
    "",
    "| Receipt | Expected | Actual | Result | Reason | Typical passenger (current meal rule) |",
    "|---|---|---|---|---|---|",
    ...decisionRows,
    "",
  ].join("\n");
  writeFileSync(path.join(process.cwd(), "docs", "EVAL_A2.md"), report);
  console.log(`reading ${passed}/${total}, decisions ${decisionsPassed}/${decisionsTotal}, ${cost.toFixed(4)} USD`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
