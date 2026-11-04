// Refunds under Art 8(1)(a) (SPEC F12, 9.8). A booking paid with PayPal on the demo booking page
// is refunded to its original capture through Payments v2; any other payment method is recorded
// as "refund to the original payment method, outside this demo". The refund entitlement follows
// the PayPal refund: PAYING while pending, PAID when completed, back to READY if it fails.

import type { PrismaClient } from "@/generated/prisma/client";
import { refundDemoBooking } from "@/lib/demo/booking";
import { getRefund, refundSchema } from "@/lib/paypal/orders";
import { audit } from "./audit";

/** Art 8(1)(a): the refund is due within seven days. */
export const REFUND_DAYS = 7;

const FINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function refundEntitlementStatus(refundStatus: string): "PAYING" | "PAID" | "READY" {
  if (refundStatus === "COMPLETED") return "PAID";
  if (refundStatus === "FAILED" || refundStatus === "CANCELLED") return "READY";
  return "PAYING";
}

/** Moves the REFUND entitlement of the booking's passengers to match the PayPal refund. */
export async function applyRefundStatus(db: PrismaClient, refundId: string) {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { booking: { include: { passengers: { select: { id: true } } } } } });
  const status = refundEntitlementStatus(refund.status);
  const passengerIds = refund.booking.passengers.map((p) => p.id);
  const changed = await db.entitlement.updateMany({
    where: { passengerId: { in: passengerIds }, kind: "REFUND", amountCents: { gt: 0 }, status: { notIn: ["NOT_OWED", status] } },
    data: { status },
  });
  if (changed.count > 0) {
    for (const passengerId of passengerIds) {
      await audit(db, { actorType: "PAYPAL", action: "REFUND_STATUS", entityType: "Passenger", entityId: passengerId, summary: `PayPal refund ${refund.paypalRefundId ?? "(not created)"} is ${refund.status}${refund.lastError ? `: ${refund.lastError}` : ""}`, data: { refundId: refund.id } });
    }
  }
}

/**
 * Called when a passenger chooses a refund. Only PayPal demo bookings are refunded through the
 * API; the call is idempotent (one refund per booking, PayPal-Request-Id stored before the call).
 */
export async function requestPassengerRefund(db: PrismaClient, passengerId: string): Promise<"REQUESTED" | "OUTSIDE_DEMO" | "NOT_OWED"> {
  const p = await db.passenger.findUniqueOrThrow({ where: { id: passengerId }, include: { booking: true, entitlements: { where: { kind: "REFUND" } } } });
  const owed = p.entitlements.find((e) => e.amountCents > 0 && e.status !== "NOT_OWED");
  if (!owed) return "NOT_OWED";
  if (p.booking.paymentMethod !== "PAYPAL" || !p.booking.paypalCaptureId) {
    await audit(db, { actorType: "SYSTEM", action: "REFUND_RECORDED", entityType: "Passenger", entityId: passengerId, summary: "Refund to the original payment method recorded; it is handled outside this demo" });
    return "OUTSIDE_DEMO";
  }
  const refund = await refundDemoBooking(p.booking.id);
  await audit(db, { actorType: "SYSTEM", action: "REFUND_REQUESTED", entityType: "Passenger", entityId: passengerId, summary: `Refund of the PayPal capture requested (Payments v2): ${refund.status}`, data: { refundId: refund.id } });
  await applyRefundStatus(db, refund.id);
  return "REQUESTED";
}

/** Polling path: re-reads refunds still in flight for a disruption's bookings. */
export async function refreshRefunds(db: PrismaClient, disruptionId: string): Promise<number> {
  const refunds = await db.refund.findMany({ where: { paypalRefundId: { not: null }, booking: { passengers: { some: { disruptionId } } } } });
  let changed = 0;
  for (const r of refunds.filter((x) => !FINAL.has(x.status))) {
    const res = await getRefund(r.paypalRefundId!);
    const parsed = refundSchema.safeParse(res.data);
    if (res.ok && parsed.success && parsed.data.status !== r.status) {
      await db.refund.update({ where: { id: r.id }, data: { status: parsed.data.status } });
      await applyRefundStatus(db, r.id);
      changed++;
    }
  }
  return changed;
}
