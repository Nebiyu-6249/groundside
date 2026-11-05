// Receipts end to end (SPEC F11): process the photo, read it with A2, run the code checks,
// store the outcome, and pay approved amounts with the passenger's existing PayPal consent.
// Meal receipts reimburse what the flat meal allowance did not cover, up to the Demo Air daily
// maximum for the wait; hotel and transport receipts draw on their reimbursement caps.

import type { PrismaClient } from "@/generated/prisma/client";
import { aiConfig } from "@/lib/ai/config";
import { readReceipt } from "@/lib/ai/a2/extract";
import type { A2Output } from "@/lib/ai/a2/schema";
import { openAiCaller } from "@/lib/ai/provider";
import { prismaSpendLog } from "@/lib/ai/spend";
import { loadPolicy } from "@/lib/demo/seed";
import { audit } from "@/lib/ops/audit";
import { checkReceipt, type ReceiptBucket, type ReceiptOutcome } from "./checks";
import { hammingDistance, NEAR_DUPLICATE_DISTANCE, processReceiptImage } from "./image";

export class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

const BUCKET_KIND: Record<ReceiptBucket, "MEAL_ALLOWANCE" | "HOTEL_REIMBURSEMENT_CAP" | "TRANSPORT_REIMBURSEMENT_CAP"> = { MEAL: "MEAL_ALLOWANCE", HOTEL: "HOTEL_REIMBURSEMENT_CAP", TRANSPORT: "TRANSPORT_REIMBURSEMENT_CAP" };
const APPROVED = ["AUTO_APPROVED", "APPROVED_BY_HUMAN"] as const;
const MAX_PER_DAY = 10;

interface StoredChecks { outcome: ReceiptOutcome; window: { startUtc: string; endUtc: string; tz: string }; aiNotice: string | null; model: string; promptVersion: string }

async function passengerContext(db: PrismaClient, passengerId: string) {
  const p = await db.passenger.findUniqueOrThrow({
    where: { id: passengerId },
    include: { entitlements: true, disruption: { include: { flight: { include: { originAirport: true } } } }, receipts: { select: { decision: true, checks: true, approvedCents: true } } },
  });
  const policy = loadPolicy();
  const f = p.disruption.flight;
  const rerouting = (p.rerouting ?? null) as { dep?: string } | null;
  const newDep = rerouting?.dep ? new Date(rerouting.dep) : f.actualDep ?? f.schedDep;
  const window = {
    startUtc: new Date(f.schedDep.getTime() - policy.receiptWindowBeforeSchedDepMinutes * 60_000),
    endUtc: new Date(newDep.getTime() + policy.receiptWindowAfterNewDepMinutes * 60_000),
    tz: f.originAirport.tz,
  };
  // Already approved on receipts, per bucket.
  const used: Record<ReceiptBucket, number> = { MEAL: 0, HOTEL: 0, TRANSPORT: 0 };
  for (const r of p.receipts) {
    if (!r.decision || !(APPROVED as readonly string[]).includes(r.decision)) continue;
    const by = (r.checks as unknown as StoredChecks | null)?.outcome.byBucket;
    if (by) for (const b of Object.keys(used) as ReceiptBucket[]) used[b] += by[b] ?? 0;
  }
  const owed = (kind: string) => {
    const e = p.entitlements.find((x) => x.kind === kind);
    return e && e.status !== "NOT_OWED" && e.status !== "CANCELLED" ? e.amountCents : 0;
  };
  const hours = Math.max(0, (window.endUtc.getTime() - window.startUtc.getTime()) / 3_600_000);
  const mealMax = owed("MEAL_ALLOWANCE") > 0 ? policy.mealAllowanceMaxPer24hEur * 100 * Math.max(1, Math.ceil(hours / 24)) : 0;
  const remaining: Record<ReceiptBucket, number> = {
    MEAL: Math.max(0, mealMax - owed("MEAL_ALLOWANCE") - used.MEAL),
    HOTEL: Math.max(0, owed("HOTEL_REIMBURSEMENT_CAP") - used.HOTEL),
    TRANSPORT: Math.max(0, owed("TRANSPORT_REIMBURSEMENT_CAP") - used.TRANSPORT),
  };
  return { p, policy, window, remaining };
}

function priorFrom(rows: { id: string; sha256: string; pHash: string | null; extracted: unknown }[]) {
  return rows.map((r) => {
    const x = r.extracted as A2Output | null;
    return { id: r.id, sha256: r.sha256, dHash: r.pHash, merchantName: x?.merchantName ?? null, total: x?.total ?? null, date: x?.date ?? null, time: x?.time ?? null };
  });
}

export async function submitReceipt(db: PrismaClient, passengerId: string, file: { bytes: Buffer; mimeType: string }, opts: { demoDateOverride?: string | null } = {}) {
  const since = new Date(Date.now() - 86_400_000);
  if ((await db.receipt.count({ where: { passengerId, createdAt: { gte: since } } })) >= MAX_PER_DAY) throw new ReceiptError(`You can upload ${MAX_PER_DAY} receipts a day.`);
  const ctx = await passengerContext(db, passengerId);
  if (!ctx.p.entitlements.some((e) => ["MEAL_ALLOWANCE", "HOTEL_REIMBURSEMENT_CAP", "TRANSPORT_REIMBURSEMENT_CAP"].includes(e.kind) && e.amountCents > 0 && e.status !== "NOT_OWED")) {
    throw new ReceiptError("No meal, hotel or transport costs are covered for your flight.");
  }
  const img = await processReceiptImage(file.bytes, file.mimeType);
  // Duplicates are checked across all passengers of the same data set: the owner's demo, or one
  // judge's run. Otherwise one judge trying a demo receipt would block it for every later judge.
  const scope = { passenger: { disruption: { judgeRunId: ctx.p.disruption.judgeRunId } } };
  const prior = priorFrom(await db.receipt.findMany({ where: scope, select: { id: true, sha256: true, pHash: true, extracted: true } }));

  // An exact duplicate is rejected without spending an AI call.
  const isExact = prior.some((x) => x.sha256 === img.sha256);
  const f = ctx.p.disruption.flight;
  const reading = isExact
    ? null
    : await readReceipt(
        { jpeg: img.jpeg, sha256: img.sha256, scenarioContext: `The passenger's flight ${f.flightNumber} was disrupted at ${f.originAirport.city} (${f.originAirport.iata}).` },
        { config: aiConfig(), caller: process.env.OPENAI_API_KEY ? openAiCaller(process.env.OPENAI_API_KEY) : null, spend: prismaSpendLog(db) },
      );
  const outcome = checkReceipt({
    reading: reading?.output ?? null,
    sha256: img.sha256,
    dHash: img.dHash,
    prior,
    nearDuplicateDistance: NEAR_DUPLICATE_DISTANCE,
    distance: hammingDistance,
    window: ctx.window,
    demoDateOverride: opts.demoDateOverride ?? null,
    excludedCategories: new Set(["ALCOHOL", "TOBACCO", "DUTY_FREE"]),
    fxToEur: ctx.policy.fxRates.toEur,
    remainingCents: ctx.remaining,
  });
  const checks: StoredChecks = { outcome, window: { startUtc: ctx.window.startUtc.toISOString(), endUtc: ctx.window.endUtc.toISOString(), tz: ctx.window.tz }, aiNotice: reading?.notice ?? null, model: reading?.model ?? "none", promptVersion: reading?.promptVersion ?? "none" };
  const receipt = await db.receipt.create({
    data: {
      passengerId,
      image: new Uint8Array(img.jpeg),
      sha256: img.sha256,
      pHash: img.dHash,
      extracted: reading?.output ? JSON.parse(JSON.stringify(reading.output)) : undefined,
      checks: JSON.parse(JSON.stringify(checks)),
      decision: outcome.decision,
      approvedCents: outcome.decision === "AUTO_APPROVED" ? outcome.approvedCents : null,
      demoDateOverride: opts.demoDateOverride ? new Date(`${opts.demoDateOverride}T12:00:00Z`) : null,
    },
  });
  await audit(db, { actorType: "PASSENGER", actorId: passengerId, action: "RECEIPT_SUBMITTED", entityType: "Receipt", entityId: receipt.id, summary: `Receipt ${outcome.decision.toLowerCase().replace("_", " ")}: ${outcome.reason}` });
  return { receiptId: receipt.id, decision: outcome.decision, reason: outcome.reason, approvedCents: receipt.approvedCents ?? 0, disruptionId: ctx.p.disruptionId };
}

/** A duty manager approves (within the remaining allowance) or rejects a receipt in review. */
export async function reviewReceipt(db: PrismaClient, user: { id: string; name: string }, receiptId: string, approve: boolean, reason: string) {
  const r = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
  if (r.decision !== "HUMAN_REVIEW") throw new ReceiptError("Only receipts waiting for review can be decided.");
  if (reason.trim().length < 5) throw new ReceiptError("Give a short reason.");
  const stored = r.checks as unknown as StoredChecks;
  let approvedCents = 0;
  let byBucket = { MEAL: 0, HOTEL: 0, TRANSPORT: 0 };
  if (approve) {
    // Re-apply today's remaining allowance to what the checks found reimbursable.
    const { remaining } = await passengerContext(db, r.passengerId);
    byBucket = { MEAL: Math.min(stored.outcome.byBucket.MEAL, remaining.MEAL), HOTEL: Math.min(stored.outcome.byBucket.HOTEL, remaining.HOTEL), TRANSPORT: Math.min(stored.outcome.byBucket.TRANSPORT, remaining.TRANSPORT) };
    approvedCents = byBucket.MEAL + byBucket.HOTEL + byBucket.TRANSPORT;
    if (approvedCents === 0) throw new ReceiptError("Nothing on this receipt is reimbursable within the remaining allowance.");
  }
  const claimed = await db.receipt.updateMany({
    where: { id: receiptId, decision: "HUMAN_REVIEW" },
    data: { decision: approve ? "APPROVED_BY_HUMAN" : "REJECTED", approvedCents: approve ? approvedCents : null, reviewerId: user.id, checks: JSON.parse(JSON.stringify({ ...stored, outcome: { ...stored.outcome, byBucket, approvedCents, reason: reason.trim() } })) },
  });
  if (claimed.count === 0) throw new ReceiptError("Someone else decided this receipt first.");
  await audit(db, { actorType: "USER", actorId: user.id, action: approve ? "RECEIPT_APPROVED" : "RECEIPT_REJECTED", entityType: "Receipt", entityId: receiptId, summary: `${user.name} ${approve ? `approved ${(approvedCents / 100).toFixed(2)} EUR` : "rejected the receipt"}: ${reason.trim()}` });
  return { approvedCents };
}

/** The entitlement a receipt payout draws on: the bucket with the largest approved share. */
export function receiptEntitlementKind(byBucket: Record<ReceiptBucket, number>) {
  const top = (Object.keys(byBucket) as ReceiptBucket[]).sort((a, b) => byBucket[b] - byBucket[a])[0];
  return BUCKET_KIND[top];
}
