// Demo booking flow (docs/SPEC.md 9.8): one fictional fare, paid with PayPal sandbox,
// refunded through Payments v2. Request ids are stored before each PayPal call so a
// retried request reuses them and cannot charge or refund twice.

import { randomInt, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import {
  captureOrder,
  captureResultSchema,
  createOrder,
  firstCapture,
  getRefund,
  orderSchema,
  refundCapture,
  refundSchema,
} from "@/lib/paypal/orders";
import { DEMO_FARE } from "./fare";

const FINAL_REFUND_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export class DemoBookingError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly debugId: string | null = null,
  ) {
    super(message);
    this.name = "DemoBookingError";
  }
}

function syntheticPnr(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export async function startDemoOrder() {
  const db = getDb();
  const booking = await db.booking.create({
    data: {
      pnr: syntheticPnr(),
      totalCents: DEMO_FARE.amountCents,
      currency: DEMO_FARE.currency,
      paymentMethod: "PAYPAL",
      orderRequestId: randomUUID(),
      orderStatus: "REQUESTED",
      segments: [{ flight: DEMO_FARE.flight, from: "EDDF", to: "OMDB" }],
    },
  });
  const res = await createOrder({
    requestId: booking.orderRequestId!,
    amountCents: booking.totalCents,
    currency: booking.currency,
    description: `${DEMO_FARE.flight} demo seat (fictional carrier)`,
    referenceId: booking.pnr,
  });
  const order = orderSchema.safeParse(res.data);
  if (!res.ok || !order.success) {
    await db.booking.update({ where: { id: booking.id }, data: { orderStatus: "CREATE_FAILED" } });
    throw new DemoBookingError("PayPal could not create the order", 502, res.debugId);
  }
  await db.booking.update({
    where: { id: booking.id },
    data: { paypalOrderId: order.data.id, orderStatus: order.data.status },
  });
  return { orderId: order.data.id, bookingId: booking.id, pnr: booking.pnr };
}

export async function captureDemoOrder(orderId: string) {
  const db = getDb();
  let booking = await db.booking.findUnique({ where: { paypalOrderId: orderId } });
  if (!booking) throw new DemoBookingError("Unknown order", 404);
  if (booking.paypalCaptureId) {
    return { bookingId: booking.id, captureId: booking.paypalCaptureId, status: booking.orderStatus };
  }
  if (!booking.captureRequestId) {
    booking = await db.booking.update({
      where: { id: booking.id },
      data: { captureRequestId: randomUUID() },
    });
  }
  const res = await captureOrder(orderId, booking.captureRequestId!);
  const result = captureResultSchema.safeParse(res.data);
  const capture = result.success ? firstCapture(result.data) : null;
  if (!res.ok || !result.success || !capture) {
    throw new DemoBookingError("PayPal could not capture the payment", 502, res.debugId);
  }
  await db.booking.update({
    where: { id: booking.id },
    data: { paypalCaptureId: capture.id, orderStatus: result.data.status },
  });
  return { bookingId: booking.id, captureId: capture.id, status: result.data.status };
}

export async function refundDemoBooking(bookingId: string) {
  const db = getDb();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { refunds: { orderBy: { createdAt: "desc" } } },
  });
  if (!booking) throw new DemoBookingError("Unknown booking", 404);
  if (!booking.paypalCaptureId) throw new DemoBookingError("Booking has not been paid", 409);

  // One full refund per booking: reuse any refund that has not failed.
  let refund = booking.refunds.find((r) => r.status !== "FAILED");
  refund ??= await db.refund.create({
    data: {
      bookingId: booking.id,
      captureId: booking.paypalCaptureId,
      requestId: randomUUID(),
      amountCents: booking.totalCents,
      status: "REQUESTED",
    },
  });
  if (refund.paypalRefundId) return refund;

  const res = await refundCapture(refund.captureId, refund.requestId);
  const parsed = refundSchema.safeParse(res.data);
  if (!res.ok || !parsed.success) {
    const body = res.data as { name?: string } | null;
    return db.refund.update({
      where: { id: refund.id },
      data: { status: "FAILED", lastError: `${res.status} ${body?.name ?? ""} debug ${res.debugId ?? "-"}` },
    });
  }
  return db.refund.update({
    where: { id: refund.id },
    data: { paypalRefundId: parsed.data.id, status: parsed.data.status, lastError: null },
  });
}

/** Booking with refunds; refunds still in flight are re-read from PayPal (polling path). */
export async function getDemoBooking(bookingId: string) {
  const db = getDb();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { refunds: { orderBy: { createdAt: "desc" } } },
  });
  if (!booking) throw new DemoBookingError("Unknown booking", 404);

  for (const refund of booking.refunds) {
    if (!refund.paypalRefundId || FINAL_REFUND_STATUSES.has(refund.status)) continue;
    const res = await getRefund(refund.paypalRefundId);
    const parsed = refundSchema.safeParse(res.data);
    if (res.ok && parsed.success && parsed.data.status !== refund.status) {
      await db.refund.update({ where: { id: refund.id }, data: { status: parsed.data.status } });
      refund.status = parsed.data.status;
    }
  }
  return {
    id: booking.id,
    pnr: booking.pnr,
    totalCents: booking.totalCents,
    currency: booking.currency,
    orderStatus: booking.orderStatus,
    captureId: booking.paypalCaptureId,
    refunds: booking.refunds.map((r) => ({
      id: r.id,
      paypalRefundId: r.paypalRefundId,
      status: r.status,
      amountCents: r.amountCents,
      lastError: r.lastError,
    })),
  };
}
