import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { eventResourceId, processEvent, storeEvent } from "@/lib/paypal/webhook-store";

// In-memory stand-in for the two tables the store touches.
function fakeDb() {
  const events = new Map<string, Record<string, unknown>>();
  const refunds = [{ paypalRefundId: "R1", status: "PENDING" }];
  const db = {
    webhookEvent: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => {
        if (events.has(data.id)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        events.set(data.id, { ...data });
        return data;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
        Object.assign(events.get(where.id)!, data);
      }),
    },
    refund: {
      updateMany: vi.fn(async ({ where, data }: { where: { paypalRefundId: string }; data: { status: string } }) => {
        refunds.filter((r) => r.paypalRefundId === where.paypalRefundId).forEach((r) => (r.status = data.status));
      }),
    },
  };
  return { db: db as unknown as PrismaClient, events, refunds };
}

describe("webhook store idempotency (SPEC 9.4)", () => {
  it("stores an event once and reports repeats as duplicates", async () => {
    const { db, events } = fakeDb();
    const event = { id: "WH-1", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS" };
    expect(await storeEvent(db, event)).toBe("stored");
    expect(await storeEvent(db, event)).toBe("duplicate");
    expect(events.size).toBe(1);
  });

  it("applies a refund event to the matching refund and marks the event processed", async () => {
    const { db, events, refunds } = fakeDb();
    const event = {
      id: "WH-2",
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { id: "R1", status: "COMPLETED" },
    };
    await storeEvent(db, event);
    await processEvent(db, event);
    expect(refunds[0].status).toBe("COMPLETED");
    expect(events.get("WH-2")?.processedAt).toBeInstanceOf(Date);
  });

  it("takes the resource id from payout item, payout batch and refund events", () => {
    // Shapes as delivered by the sandbox in the Phase 0 spike (docs/PHASE0_RESULTS.md).
    expect(
      eventResourceId({
        id: "a",
        event_type: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
        resource: { payout_item_id: "ZRXFCNWWNJ2VC" },
      }),
    ).toBe("ZRXFCNWWNJ2VC");
    expect(
      eventResourceId({
        id: "b",
        event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
        resource: { batch_header: { payout_batch_id: "JZYQH4CKG63TA" } },
      }),
    ).toBe("JZYQH4CKG63TA");
    expect(
      eventResourceId({ id: "c", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R1" } }),
    ).toBe("R1");
    expect(eventResourceId({ id: "d", event_type: "X" })).toBeNull();
  });

  it("records a processing error instead of throwing", async () => {
    const { db, events } = fakeDb();
    const event = { id: "WH-3", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R9" } };
    await storeEvent(db, event);
    vi.mocked(db.refund.updateMany).mockRejectedValueOnce(new Error("db down"));
    await expect(processEvent(db, event)).resolves.toBeUndefined();
    expect(events.get("WH-3")?.error).toBe("db down");
  });
});
