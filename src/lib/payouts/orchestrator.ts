// Payout orchestrator (SPEC 9.2, 9.6): accepted entitlements are paid in micro-batches of up to
// PAYOUT_BATCH_SIZE, priority passengers first, under the daily cap. The batch and its items are
// written before PayPal is called, so a retry reuses the same sender_batch_id.

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { audit } from "@/lib/ops/audit";
import { PaypalNetworkError } from "@/lib/paypal/http";
import { paypalAccount } from "@/lib/paypal/account";
import { createBatchResponseSchema, createPayoutBatch } from "@/lib/paypal/payouts";
import { applyBatchUpdate, NO_MONEY } from "./transitions";
import { receiptEntitlementKind } from "@/lib/receipts/service";
import { balancePaused, INSUFFICIENT_FUNDS, sentTodayCents } from "./limits";

const KINDS = [
  { entitlement: "COMPENSATION" as const, batch: "COMPENSATION" as const, note: "EU261 compensation" },
  { entitlement: "MEAL_ALLOWANCE" as const, batch: "MEAL" as const, note: "Meal allowance" },
];
const RECEIPT_NOTE = "Receipt reimbursement";

export interface PayoutSettings {
  batchSize: number;
  dailyCapCents: number;
}

export function payoutSettings(env: Record<string, string | undefined> = process.env): PayoutSettings {
  const size = Number(env.PAYOUT_BATCH_SIZE ?? "20");
  const cap = Number(env.PAYOUT_DAILY_CAP_EUR ?? "20000");
  return { batchSize: Number.isInteger(size) && size > 0 && size <= 100 ? size : 20, dailyCapCents: Math.round((Number.isFinite(cap) ? cap : 20000) * 100) };
}

/** Sum of payout items created since 00:00 UTC that did not fail before money moved. */
export async function paidTodayCents(db: PrismaClient): Promise<number> {
  return sentTodayCents(db);
}

const newItemId = () => `pi${randomUUID().replace(/-/g, "").slice(0, 22)}`;

/** Adopts the batch named in a duplicate sender_batch_id error (shape recorded in Phase 0). */
export function duplicateBatchId(data: unknown): string | null {
  const details = (data as { name?: string; details?: { field?: string; link?: { href?: string }[] }[] } | null)?.details ?? [];
  const d = details.find((x) => x.field === "SENDER_BATCH_ID");
  const href = d?.link?.[0]?.href;
  return href ? href.split("/").pop() ?? null : null;
}

async function sendBatch(db: PrismaClient, batchId: string): Promise<void> {
  const batch = await db.payoutBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: true } });
  const input = {
    senderBatchId: batch.senderBatchId,
    emailSubject: "Your payment from Demo Air (fictional carrier)",
    emailMessage: "Sandbox payment from Groundside, a demo. No real money.",
    items: batch.items.map((i) => ({ senderItemId: i.senderItemId, receiver: i.receiver, amountCents: i.amountCents, note: `${batch.kind === "RECEIPT" ? RECEIPT_NOTE : KINDS.find((k) => k.batch === batch.kind)?.note ?? "Payment"} (Demo Air, demo data)` })),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    let status = 0;
    let data: unknown = null;
    let debugId: string | null = null;
    try {
      const res = await createPayoutBatch(input);
      status = res.status;
      data = res.data;
      debugId = res.debugId;
    } catch (err) {
      if (!(err instanceof PaypalNetworkError)) throw err;
      status = 0;
    }
    if (status === 201 || status === 200) {
      const parsed = createBatchResponseSchema.safeParse(data);
      if (parsed.success) {
        const h = parsed.data.batch_header;
        await db.payoutBatch.update({ where: { id: batch.id }, data: { paypalBatchId: h.payout_batch_id, status: "CREATING", lastError: null, lastSyncedAt: new Date() } });
        await db.payoutItem.updateMany({ where: { batchId: batch.id, status: "CREATING" }, data: { status: "PENDING" } });
        await applyBatchUpdate(db, h.payout_batch_id, h.batch_status, "CREATE");
        return;
      }
    }
    const adopted = status === 400 ? duplicateBatchId(data) : null;
    if (adopted) {
      await db.payoutBatch.update({ where: { id: batch.id }, data: { paypalBatchId: adopted, status: "PENDING", lastError: null } });
      await db.payoutItem.updateMany({ where: { batchId: batch.id, status: "CREATING" }, data: { status: "PENDING" } });
      await audit(db, { actorType: "SYSTEM", action: "PAYOUT_BATCH_ADOPTED", entityType: "PayoutBatch", entityId: batch.id, summary: `sender_batch_id already used; adopted PayPal batch ${adopted}` });
      return;
    }
    // Retry once only when PayPal documents it as safe: after a 5xx or no response.
    if ((status === 0 || status >= 500) && attempt === 0) continue;
    // PayPal names the error in the body; insufficient funds pauses payouts (src/lib/payouts/limits.ts).
    const errorName = (data as { name?: string } | null)?.name ?? "";
    const message = errorName === INSUFFICIENT_FUNDS
      ? `${INSUFFICIENT_FUNDS}: the sandbox business balance is too low for this batch (HTTP ${status}${debugId ? `, debug ${debugId}` : ""})`
      : `PayPal returned ${status || "no response"}${errorName ? ` ${errorName}` : ""}${debugId ? ` (debug ${debugId})` : ""}`;
    if (status === 0 || status >= 500) {
      // Outcome unknown: leave the batch CREATING so reconciliation retries with the same ID.
      await db.payoutBatch.update({ where: { id: batch.id }, data: { lastError: message } });
      return;
    }
    await db.$transaction([
      db.payoutBatch.update({ where: { id: batch.id }, data: { status: "FAILED_TO_CREATE", lastError: message } }),
      db.payoutItem.updateMany({ where: { batchId: batch.id }, data: { status: "FAILED", lastError: message, finalAt: new Date() } }),
      // Receipt items leave their entitlement alone: it may already be paid by its own payout.
      db.entitlement.updateMany({ where: { id: { in: batch.items.filter((i) => !i.receiptId).map((i) => i.entitlementId) } }, data: { status: "ACCEPTED" } }),
    ]);
    await audit(db, { actorType: "PAYPAL", action: errorName === INSUFFICIENT_FUNDS ? "PAYOUT_BALANCE_OUT" : "PAYOUT_BATCH_FAILED", entityType: "PayoutBatch", entityId: batch.id, summary: message, data });
    return;
  }
}

/** Retries batches that were written but never confirmed by PayPal (crash or unknown outcome). */
export async function resendStuckBatches(db: PrismaClient, disruptionId: string): Promise<number> {
  const stuck = await db.payoutBatch.findMany({ where: { paypalBatchId: null, status: "CREATING", paypalAccount: paypalAccount(), createdAt: { lt: new Date(Date.now() - 30_000) }, items: { some: { entitlement: { passenger: { disruptionId } } } } } });
  for (const b of stuck) await sendBatch(db, b.id);
  return stuck.length;
}

export async function payDisruption(db: PrismaClient, disruptionId: string, settings: PayoutSettings = payoutSettings()) {
  // Nothing is payable before a decision, except meal allowances once care is released (SPEC F6).
  // Compensation stays PENDING_DECISION until then, so it is never selected below.
  const d = await db.disruption.findUniqueOrThrow({ where: { id: disruptionId }, select: { careReleasedAt: true, decisions: { select: { id: true } } } });
  if (d.decisions.length === 0 && !d.careReleasedAt) return { batches: 0, items: 0, skippedForCap: 0 };
  // After PayPal refused a batch for insufficient funds, wait before trying again: everything stays
  // queued (ACCEPTED), and the rest of the demo is unaffected.
  if (await balancePaused(db)) return { batches: 0, items: 0, skippedForCap: 0, heldForBalance: true };
  let remainingCap = settings.dailyCapCents - (await paidTodayCents(db));
  let batches = 0;
  let items = 0;
  let skippedForCap = 0;
  const shortId = disruptionId.slice(-8);

  for (const kind of KINDS) {
    const due = await db.entitlement.findMany({
      where: {
        kind: kind.entitlement,
        status: "ACCEPTED",
        amountCents: { gt: 0 },
        // A passenger waiting to switch an unclaimed payout to bank transfer gets nothing new via PayPal.
        passenger: { disruptionId, payoutReceiver: { not: null }, offers: { some: { paymentChoice: "PAYPAL", bankSwitchRequestedAt: null } } },
        payoutItems: { none: { status: { notIn: [...NO_MONEY] } } },
      },
      include: { passenger: { select: { payoutReceiver: true, priorityReason: true, manifestIndex: true } } },
    });
    due.sort((a, b) => Number(!a.passenger.priorityReason) - Number(!b.passenger.priorityReason) || a.passenger.manifestIndex - b.passenger.manifestIndex);
    const affordable = [];
    for (const e of due) {
      if (e.amountCents <= remainingCap) {
        affordable.push(e);
        remainingCap -= e.amountCents;
      } else skippedForCap++;
    }
    for (let i = 0; i < affordable.length; i += settings.batchSize) {
      const chunk = affordable.slice(i, i + settings.batchSize);
      const seq = (await db.payoutBatch.count({ where: { senderBatchId: { startsWith: `gs-${shortId}-` } } })) + 1;
      const senderBatchId = `gs-${shortId}-${kind.batch.toLowerCase()}-${seq}`;
      const rows = chunk.map((e) => ({ id: newItemId(), e }));
      let batchId: string;
      try {
        batchId = await db.$transaction(async (tx) => {
          const b = await tx.payoutBatch.create({ data: { senderBatchId, paypalAccount: paypalAccount(), kind: kind.batch, status: "CREATING", itemCount: rows.length, totalCents: rows.reduce((s, r) => s + r.e.amountCents, 0) } });
          await tx.payoutItem.createMany({ data: rows.map((r) => ({ id: r.id, senderItemId: r.id, batchId: b.id, entitlementId: r.e.id, receiver: r.e.passenger.payoutReceiver!, amountCents: r.e.amountCents, status: "CREATING" })) });
          await tx.entitlement.updateMany({ where: { id: { in: rows.map((r) => r.e.id) } }, data: { status: "PAYING" } });
          return b.id;
        });
      } catch (err) {
        // The partial unique index refused a second active item: another request is paying these.
        if ((err as { code?: string }).code === "P2002") continue;
        throw err;
      }
      await audit(db, { actorType: "SYSTEM", action: "PAYOUT_BATCH_CREATED", entityType: "PayoutBatch", entityId: batchId, summary: `${kind.note}: batch ${senderBatchId} with ${rows.length} item(s)` });
      await sendBatch(db, batchId);
      batches++;
      items += rows.length;
    }
  }
  // Approved receipts, one payout item each, with the passenger's existing PayPal consent (SPEC F11).
  const receipts = await db.receipt.findMany({
    where: {
      decision: { in: ["AUTO_APPROVED", "APPROVED_BY_HUMAN"] },
      approvedCents: { gt: 0 },
      payoutItems: { none: { status: { notIn: [...NO_MONEY] } } },
      passenger: { disruptionId, payoutReceiver: { not: null }, offers: { some: { paymentChoice: "PAYPAL", bankSwitchRequestedAt: null } } },
    },
    include: { passenger: { select: { payoutReceiver: true, entitlements: { select: { id: true, kind: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const payable = [];
  for (const r of receipts) {
    if (r.approvedCents! <= remainingCap) {
      payable.push(r);
      remainingCap -= r.approvedCents!;
    } else skippedForCap++;
  }
  for (let i = 0; i < payable.length; i += settings.batchSize) {
    const chunk = payable.slice(i, i + settings.batchSize);
    const seq = (await db.payoutBatch.count({ where: { senderBatchId: { startsWith: `gs-${shortId}-` } } })) + 1;
    const senderBatchId = `gs-${shortId}-receipt-${seq}`;
    const rows = chunk.map((r) => {
      const kind = receiptEntitlementKind((r.checks as { outcome?: { byBucket?: Record<"MEAL" | "HOTEL" | "TRANSPORT", number> } } | null)?.outcome?.byBucket ?? { MEAL: r.approvedCents!, HOTEL: 0, TRANSPORT: 0 });
      return { id: newItemId(), r, entitlementId: r.passenger.entitlements.find((e) => e.kind === kind)!.id };
    });
    let batchId: string;
    try {
      batchId = await db.$transaction(async (tx) => {
        const b = await tx.payoutBatch.create({ data: { senderBatchId, paypalAccount: paypalAccount(), kind: "RECEIPT", status: "CREATING", itemCount: rows.length, totalCents: rows.reduce((s, x) => s + x.r.approvedCents!, 0) } });
        await tx.payoutItem.createMany({ data: rows.map((x) => ({ id: x.id, senderItemId: x.id, batchId: b.id, entitlementId: x.entitlementId, receiptId: x.r.id, receiver: x.r.passenger.payoutReceiver!, amountCents: x.r.approvedCents!, status: "CREATING" })) });
        return b.id;
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
    await audit(db, { actorType: "SYSTEM", action: "PAYOUT_BATCH_CREATED", entityType: "PayoutBatch", entityId: batchId, summary: `${RECEIPT_NOTE}: batch ${senderBatchId} with ${rows.length} item(s)` });
    await sendBatch(db, batchId);
    batches++;
    items += rows.length;
  }

  if (skippedForCap > 0) {
    await audit(db, { actorType: "SYSTEM", action: "PAYOUT_CAP_REACHED", entityType: "Disruption", entityId: disruptionId, summary: `Daily payout cap reached; ${skippedForCap} payout(s) wait for tomorrow` });
  }
  if (batches > 0) await db.disruption.updateMany({ where: { id: disruptionId, status: { in: ["APPROVED", "DENIAL_SIGNED"] } }, data: { status: "PAYING" } });
  return { batches, items, skippedForCap };
}
