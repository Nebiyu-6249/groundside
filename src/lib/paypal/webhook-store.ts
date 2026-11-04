// Stores verified PayPal webhook events once and applies them (docs/SPEC.md 9.4).
// Processing errors are recorded on the event and never turned into a 500; polling repairs state.

import type { PrismaClient } from "@/generated/prisma/client";
import { applyBatchUpdate, applyItemUpdate } from "@/lib/payouts/transitions";
import type { WebhookEventBody } from "./webhooks";

export type StoreResult = "stored" | "duplicate";

/**
 * The PayPal ID the event is about. Payout item events carry payout_item_id, batch events
 * carry batch_header.payout_batch_id, and capture or refund events carry id.
 */
export function eventResourceId(event: WebhookEventBody): string | null {
  const resource = event.resource as
    | { id?: string; payout_item_id?: string; batch_header?: { payout_batch_id?: string } }
    | undefined;
  return resource?.payout_item_id ?? resource?.batch_header?.payout_batch_id ?? resource?.id ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function storeEvent(db: PrismaClient, event: WebhookEventBody): Promise<StoreResult> {
  try {
    await db.webhookEvent.create({
      data: {
        id: event.id,
        eventType: event.event_type,
        resourceType: event.resource_type ?? null,
        resourceId: eventResourceId(event),
        verified: true,
        payload: event as object,
      },
    });
    return "stored";
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }
}

/** Applies the parts of an event that Phase 0 understands, then marks it processed. */
export async function processEvent(db: PrismaClient, event: WebhookEventBody): Promise<void> {
  try {
    if (event.event_type.startsWith("PAYMENT.CAPTURE.REFUND") && event.resource?.id) {
      // Resource is the refund object: its id is the PayPal refund id.
      await db.refund.updateMany({
        where: { paypalRefundId: event.resource.id },
        data: { status: event.resource.status ?? "COMPLETED" },
      });
      const { applyRefundStatus } = await import("@/lib/ops/refunds");
      for (const r of await db.refund.findMany({ where: { paypalRefundId: event.resource.id }, select: { id: true } })) await applyRefundStatus(db, r.id);
    }
    // Payout events go through the same transition functions as polling (SPEC 9.5).
    const r = event.resource as
      | { payout_item_id?: string; transaction_status?: string; transaction_id?: string; payout_item?: { sender_item_id?: string }; batch_header?: { payout_batch_id?: string; batch_status?: string } }
      | undefined;
    if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.") && r?.payout_item_id && r.transaction_status) {
      await applyItemUpdate(db, { paypalItemId: r.payout_item_id, senderItemId: r.payout_item?.sender_item_id, status: r.transaction_status, transactionId: r.transaction_id }, "WEBHOOK");
      const item = await db.payoutItem.findUnique({ where: { paypalItemId: r.payout_item_id }, select: { entitlement: { select: { passenger: { select: { disruptionId: true } } } } } });
      if (item) {
        const { finalizeBankSwitches } = await import("@/lib/payouts/unclaimed");
        await finalizeBankSwitches(db, item.entitlement.passenger.disruptionId);
      }
    }
    if (event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.") && r?.batch_header?.payout_batch_id && r.batch_header.batch_status) {
      await applyBatchUpdate(db, r.batch_header.payout_batch_id, r.batch_header.batch_status, "WEBHOOK");
    }
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await db.webhookEvent
      .update({ where: { id: event.id }, data: { error: message.slice(0, 500) } })
      .catch(() => undefined);
  }
}
