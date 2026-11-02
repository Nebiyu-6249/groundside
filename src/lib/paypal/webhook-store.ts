// Stores verified PayPal webhook events once and applies them (docs/SPEC.md 9.4).
// Processing errors are recorded on the event and never turned into a 500; polling repairs state.

import type { PrismaClient } from "@/generated/prisma/client";
import type { WebhookEventBody } from "./webhooks";

export type StoreResult = "stored" | "duplicate";

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
        resourceId: event.resource?.id ?? null,
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
