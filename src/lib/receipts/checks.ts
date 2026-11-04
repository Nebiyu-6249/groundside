// Receipt checks (SPEC 8.2), in the order the spec gives. Pure code: the AI reading is an input,
// and only these checks decide. Auto-approval needs every check to pass; anything doubtful goes to
// a person, and only exact duplicates, non-receipts and fully used allowances are rejected.

import { zonedToUtc } from "@/lib/demo/zoned";
import type { A2Output } from "@/lib/ai/a2/schema";

export type ReceiptBucket = "MEAL" | "HOTEL" | "TRANSPORT";
export type ReceiptDecision = "AUTO_APPROVED" | "HUMAN_REVIEW" | "REJECTED";

export interface PriorReceipt {
  id: string;
  sha256: string;
  dHash: string | null;
  merchantName: string | null;
  total: number | null;
  date: string | null;
  time: string | null;
}

export interface CheckInput {
  reading: A2Output | null;
  sha256: string;
  dHash: string;
  /** Receipts already submitted, by any passenger (fraud checks look across passengers). */
  prior: PriorReceipt[];
  nearDuplicateDistance: number;
  distance: (a: string, b: string) => number;
  window: { startUtc: Date; endUtc: Date; tz: string };
  /** Demo fixtures only: the scenario date replaces the printed date (SPEC 8.2). */
  demoDateOverride: string | null;
  excludedCategories: ReadonlySet<string>;
  fxToEur: Readonly<Record<string, number>>;
  /** What is still reimbursable per bucket, in cents. */
  remainingCents: Record<ReceiptBucket, number>;
}

export interface CheckResult {
  id: "duplicate" | "repeat" | "window" | "sum" | "categories" | "currency" | "caps" | "confidence" | "reading";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ReceiptOutcome {
  decision: ReceiptDecision;
  approvedCents: number;
  byBucket: Record<ReceiptBucket, number>;
  checks: CheckResult[];
  reason: string;
}

const BUCKET: Record<string, ReceiptBucket | null> = { FOOD: "MEAL", NON_ALCOHOLIC_DRINK: "MEAL", HOTEL: "HOTEL", TRANSPORT: "TRANSPORT", ALCOHOL: null, TOBACCO: null, DUTY_FREE: null, OTHER: null };
const EXCLUDED_LABEL: Record<string, string> = { ALCOHOL: "alcohol", TOBACCO: "tobacco", DUTY_FREE: "duty-free goods" };
const cents = (n: number) => Math.round(n * 100);
const eur = (c: number) => `${(c / 100).toFixed(2)} EUR`;
const zero = (): Record<ReceiptBucket, number> => ({ MEAL: 0, HOTEL: 0, TRANSPORT: 0 });

export function checkReceipt(i: CheckInput): ReceiptOutcome {
  const checks: CheckResult[] = [];
  const outcome = (decision: ReceiptDecision, reason: string, approvedCents = 0, byBucket = zero()): ReceiptOutcome => ({ decision, approvedCents, byBucket, checks, reason });
  const r = i.reading;

  // 1. Exact duplicate (same file), across all passengers.
  const exact = i.prior.find((p) => p.sha256 === i.sha256);
  if (exact) {
    checks.push({ id: "duplicate", label: "Not a duplicate", ok: false, detail: "The same image was already submitted" });
    return outcome("REJECTED", "This receipt was already submitted.");
  }

  if (!r) {
    checks.push({ id: "reading", label: "Receipt read", ok: false, detail: "The receipt could not be read automatically" });
    return outcome("HUMAN_REVIEW", "A person will read this receipt.");
  }
  if (!r.isReceipt) {
    checks.push({ id: "reading", label: "Receipt read", ok: false, detail: "The image does not look like a receipt" });
    return outcome("REJECTED", "The photo does not show a receipt.");
  }
  // 1b. Near duplicate: a similar-looking photo with the same total or the same date and time.
  // The picture alone is not enough: receipts printed from one template look alike.
  const near = i.prior.find((p) => p.dHash && i.distance(p.dHash, i.dHash) <= i.nearDuplicateDistance && ((p.total !== null && p.total === r.total) || (p.date !== null && p.date === r.date && p.time === r.time)));
  checks.push({ id: "duplicate", label: "Not a duplicate", ok: !near, detail: near ? "A very similar photo with the same amount or time was already submitted" : "No matching image" });
  const review: string[] = [];
  if (near) review.push("a very similar photo was already submitted");

  // 2. Same merchant, total and time already claimed.
  const repeat = i.prior.find((p) => p.merchantName && r.merchantName && p.merchantName.trim().toLowerCase() === r.merchantName.trim().toLowerCase() && p.total === r.total && p.time === r.time && p.date === r.date);
  checks.push({ id: "repeat", label: "Not claimed before", ok: !repeat, detail: repeat ? "Same merchant, total and time as an earlier claim" : "No earlier claim with the same merchant, total and time" });
  if (repeat) review.push("same merchant, total and time as an earlier claim");

  // 3. Date and time inside the policy window.
  const date = i.demoDateOverride ?? r.date;
  let inWindow = false;
  if (date && r.time) {
    const at = zonedToUtc(date, r.time, i.window.tz);
    inWindow = at >= i.window.startUtc && at <= i.window.endUtc;
  }
  checks.push({ id: "window", label: "Inside the disruption window", ok: inWindow, detail: !date || !r.time ? "Date or time not readable" : inWindow ? `${date} ${r.time} local time is inside the window` : `${date} ${r.time} local time is outside the disruption window` });
  if (!inWindow) review.push(!date || !r.time ? "date or time not readable" : "outside disruption window");

  // 4. Line items add up to the total.
  const sum = r.lineItems.reduce((s, l) => s + cents(l.amount), 0);
  const sumOk = r.total !== null && r.lineItems.length > 0 && Math.abs(sum - cents(r.total)) <= 1;
  checks.push({ id: "sum", label: "Lines add up to the total", ok: sumOk, detail: r.total === null ? "Total not readable" : `Lines ${(sum / 100).toFixed(2)}, total ${r.total.toFixed(2)}` });
  if (!sumOk) review.push("line items do not add up to the total");

  // 5. Excluded categories removed; currency converted with the fixed demo table.
  const excluded = r.lineItems.filter((l) => i.excludedCategories.has(l.category) || BUCKET[l.category] === null);
  checks.push({ id: "categories", label: "Excluded items removed", ok: true, detail: excluded.length ? `Not reimbursed: ${excluded.map((l) => `${l.description} (${EXCLUDED_LABEL[l.category] ?? "not a care expense"})`).join(", ")}` : "Nothing excluded" });
  const rate = r.currency === "EUR" ? 1 : r.currency ? i.fxToEur[r.currency] : undefined;
  checks.push({ id: "currency", label: "Currency", ok: rate !== undefined, detail: rate === undefined ? `${r.currency ?? "Unknown currency"} is not in the demo rate table` : r.currency === "EUR" ? "EUR" : `${r.currency} at the demo rate ${rate}` });
  if (rate === undefined) review.push("currency not in the demo rate table");

  // 6. Caps: what is still reimbursable per bucket.
  const claimed = zero();
  for (const l of r.lineItems) {
    const b = BUCKET[l.category];
    if (b && !i.excludedCategories.has(l.category)) claimed[b] += Math.round(cents(l.amount) * (rate ?? 0));
  }
  const byBucket = zero();
  for (const b of Object.keys(claimed) as ReceiptBucket[]) byBucket[b] = Math.max(0, Math.min(claimed[b], i.remainingCents[b]));
  const approvedCents = byBucket.MEAL + byBucket.HOTEL + byBucket.TRANSPORT;
  const claimedTotal = claimed.MEAL + claimed.HOTEL + claimed.TRANSPORT;
  checks.push({
    id: "caps",
    label: "Within the remaining allowance",
    ok: approvedCents > 0 || claimedTotal === 0,
    detail: (Object.keys(claimed) as ReceiptBucket[]).filter((b) => claimed[b] > 0).map((b) => `${b.toLowerCase()}: ${eur(claimed[b])} claimed, ${eur(i.remainingCents[b])} left, ${eur(byBucket[b])} reimbursable`).join("; ") || "Nothing reimbursable on this receipt",
  });

  // 7. Fields the decision depends on must not be LOW confidence.
  const low = (["date", "time", "currency", "total", "lineItems"] as const).filter((k) => r.confidence[k] === "LOW");
  checks.push({ id: "confidence", label: "Read with confidence", ok: low.length === 0, detail: low.length ? `Low confidence: ${low.join(", ")}` : "All needed fields read with medium or high confidence" });
  if (low.length) review.push(`low confidence on ${low.join(", ")}`);

  // 8. Auto-approve only if every check passed.
  if (review.length) return outcome("HUMAN_REVIEW", `Sent to a person: ${review.join("; ")}.`, approvedCents, byBucket);
  if (claimedTotal === 0) return outcome("REJECTED", "Nothing on this receipt is a care expense (meals, hotel or transport).");
  if (approvedCents === 0) return outcome("REJECTED", "Your allowance for this kind of expense is already used.");
  return outcome("AUTO_APPROVED", approvedCents < claimedTotal ? `Approved ${eur(approvedCents)} of ${eur(claimedTotal)}: the rest is above the remaining allowance.` : `Approved ${eur(approvedCents)}.`, approvedCents, byBucket);
}
