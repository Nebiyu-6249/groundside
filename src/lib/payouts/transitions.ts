// The one place payout state changes (SPEC 9.5): webhooks and polling both call these, so they
// cannot disagree. Transitions never move backwards (SUCCESS never becomes PENDING).

import type { PrismaClient } from "@/generated/prisma/client";
import { audit } from "@/lib/ops/audit";

const ITEM_RANK: Record<string, number> = {
  CREATING: 0, PENDING: 1, ONHOLD: 1, NEW: 1, UNCLAIMED: 2,
  SUCCESS: 3, FAILED: 3, RETURNED: 3, BLOCKED: 3, CANCELED: 3, DENIED: 3,
  REFUNDED: 4, REVERSED: 4,
};
const BATCH_RANK: Record<string, number> = { CREATING: 0, PENDING: 1, PROCESSING: 2, SUCCESS: 3, DENIED: 3, CANCELED: 3, FAILED_TO_CREATE: 3 };

/** Item statuses after which no money reached the passenger: a new item may be created. */
export const NO_MONEY = new Set(["FAILED", "RETURNED", "BLOCKED", "CANCELED", "DENIED", "REFUNDED", "REVERSED"]);
/** Item statuses that will not change by themselves. UNCLAIMED is not final: it can be claimed or returned. */
export const FINAL_ITEM = new Set(["SUCCESS", ...NO_MONEY]);
export const FINAL_BATCH = new Set(["SUCCESS", "DENIED", "CANCELED", "FAILED_TO_CREATE"]);

export function itemTransitionAllowed(current: string, next: string): boolean {
  if (current === next) return false;
  const a = ITEM_RANK[current];
  const b = ITEM_RANK[next];
  if (a === undefined || b === undefined) return b !== undefined && a === undefined; // unknown current: accept a known status
  return b > a;
}

export function batchTransitionAllowed(current: string, next: string): boolean {
  if (current === next) return false;
  return (BATCH_RANK[next] ?? -1) > (BATCH_RANK[current] ?? -1);
}

/** Entitlement status implied by a payout item status. */
export function entitlementStatusFor(itemStatus: string): "PAID" | "PAYING" | "ACCEPTED" {
  if (itemStatus === "SUCCESS") return "PAID";
  if (NO_MONEY.has(itemStatus)) return "ACCEPTED";
  return "PAYING";
}

export interface ItemUpdate {
  paypalItemId?: string | null;
  senderItemId?: string | null;
  status: string;
  transactionId?: string | null;
  error?: string | null;
}

/** Applies a PayPal item status; returns true if anything changed. */
export async function applyItemUpdate(db: PrismaClient, u: ItemUpdate, source: "WEBHOOK" | "POLL" | "CREATE"): Promise<boolean> {
  const item =
    (u.senderItemId ? await db.payoutItem.findUnique({ where: { senderItemId: u.senderItemId } }) : null) ??
    (u.paypalItemId ? await db.payoutItem.findUnique({ where: { paypalItemId: u.paypalItemId } }) : null);
  if (!item) return false;
  const status = u.status.toUpperCase();
  const linkOnly = !item.paypalItemId && u.paypalItemId;
  if (!itemTransitionAllowed(item.status, status)) {
    if (linkOnly) await db.payoutItem.update({ where: { id: item.id }, data: { paypalItemId: u.paypalItemId } });
    return Boolean(linkOnly);
  }
  await db.$transaction([
    db.payoutItem.update({
      where: { id: item.id },
      data: {
        status,
        paypalItemId: item.paypalItemId ?? u.paypalItemId ?? undefined,
        transactionId: u.transactionId ?? item.transactionId,
        lastError: u.error ?? (NO_MONEY.has(status) ? item.lastError : null),
        finalAt: FINAL_ITEM.has(status) ? new Date() : null,
      },
    }),
    // Receipt payouts are tracked on the item itself; the entitlement they draw on keeps its own status.
    ...(item.receiptId ? [] : [db.entitlement.update({ where: { id: item.entitlementId }, data: { status: entitlementStatusFor(status) } })]),
  ]);
  await audit(db, {
    actorType: "PAYPAL",
    action: "PAYOUT_ITEM_STATUS",
    entityType: "PayoutItem",
    entityId: item.id,
    summary: `Payout item ${item.status} to ${status} (${source.toLowerCase()})`,
    data: { paypalItemId: u.paypalItemId ?? item.paypalItemId, from: item.status, to: status, source },
  });
  return true;
}

export async function applyBatchUpdate(db: PrismaClient, paypalBatchId: string, status: string, source: "WEBHOOK" | "POLL" | "CREATE"): Promise<boolean> {
  const batch = await db.payoutBatch.findUnique({ where: { paypalBatchId } });
  if (!batch) return false;
  const next = status.toUpperCase();
  if (!batchTransitionAllowed(batch.status, next)) return false;
  await db.payoutBatch.update({ where: { id: batch.id }, data: { status: next, lastSyncedAt: new Date() } });
  await audit(db, { actorType: "PAYPAL", action: "PAYOUT_BATCH_STATUS", entityType: "PayoutBatch", entityId: batch.id, summary: `Payout batch ${batch.status} to ${next} (${source.toLowerCase()})`, data: { paypalBatchId } });
  return true;
}
