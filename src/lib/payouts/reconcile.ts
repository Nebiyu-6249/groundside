// Polling reconciliation (SPEC 9.5): reads every batch not yet final from PayPal and applies
// changes through the shared transition functions. Throttled to once per 10 s per disruption.

import type { PrismaClient } from "@/generated/prisma/client";
import { paypalAccount } from "@/lib/paypal/account";
import { batchDetailSchema, getPayoutBatch } from "@/lib/paypal/payouts";
import { resendStuckBatches } from "./orchestrator";
import { applyBatchUpdate, applyItemUpdate, FINAL_BATCH, FINAL_ITEM } from "./transitions";

const THROTTLE_MS = 10_000;
const lastRun = new Map<string, number>();

export async function reconcileDisruption(db: PrismaClient, disruptionId: string, opts: { force?: boolean } = {}) {
  const now = Date.now();
  if (!opts.force && now - (lastRun.get(disruptionId) ?? 0) < THROTTLE_MS) return { skipped: true, changed: 0 };
  lastRun.set(disruptionId, now);

  await resendStuckBatches(db, disruptionId);
  const batches = await db.payoutBatch.findMany({
    // Only batches of the current PayPal app: earlier apps' batches are archived (src/lib/paypal/account.ts).
    where: { paypalBatchId: { not: null }, paypalAccount: paypalAccount(), items: { some: { entitlement: { passenger: { disruptionId } } } } },
    include: { items: { select: { status: true } } },
  });
  let changed = 0;
  for (const b of batches) {
    const open = !FINAL_BATCH.has(b.status) || b.items.some((i) => !FINAL_ITEM.has(i.status));
    if (!open || !b.paypalBatchId) continue;
    for (let page = 1; page <= 20; page++) {
      const res = await getPayoutBatch(b.paypalBatchId, page);
      const parsed = batchDetailSchema.safeParse(res.data);
      if (!res.ok || !parsed.success) {
        await db.payoutBatch.update({ where: { id: b.id }, data: { lastError: `Sync failed: HTTP ${res.status}${res.debugId ? ` (debug ${res.debugId})` : ""}`, lastSyncedAt: new Date() } });
        break;
      }
      if (await applyBatchUpdate(db, b.paypalBatchId, parsed.data.batch_header.batch_status, "POLL")) changed++;
      for (const item of parsed.data.items ?? []) {
        if (!item.transaction_status) continue;
        const ok = await applyItemUpdate(db, { paypalItemId: item.payout_item_id, senderItemId: item.payout_item?.sender_item_id, status: item.transaction_status, transactionId: item.transaction_id }, "POLL");
        if (ok) changed++;
      }
      await db.payoutBatch.update({ where: { id: b.id }, data: { lastSyncedAt: new Date() } });
      if (page >= (parsed.data.total_page ?? 1)) break;
    }
  }
  // Bank-transfer switches wait for their unclaimed items to come back (SPEC F10).
  const { finalizeBankSwitches } = await import("./unclaimed");
  changed += await finalizeBankSwitches(db, disruptionId);
  return { skipped: false, changed };
}
