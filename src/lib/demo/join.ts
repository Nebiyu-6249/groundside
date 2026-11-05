// Joins a paid demo booking to the cancelled scenario flight (DEMO 412), so the refund path runs
// against a real sandbox capture (SPEC F12, 9.8). The buyer becomes one more passenger, copied
// from a standard passenger on that flight, with the buyer's own sandbox account as receiver.

import type { PrismaClient } from "@/generated/prisma/client";
import { getOrder } from "@/lib/paypal/orders";
import { createOffers, passengerLink } from "@/lib/ops/decisions";
import { recomputeEntitlements } from "@/lib/ops/engine-input";
import { audit } from "@/lib/ops/audit";
import { DemoBookingError } from "./booking";

export const JOIN_SCENARIO = "A";

/** Joins the owner's scenario A flight, or, for a signed-in judge, the flight in their own run (SPEC 14). */
export async function joinCancelledFlight(db: PrismaClient, bookingId: string, judgeRunId: string | null = null): Promise<{ passengerId: string; link: string }> {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { passengers: { select: { id: true } } } });
  if (!booking || booking.paymentMethod !== "PAYPAL" || !booking.paypalCaptureId || !booking.paypalOrderId) throw new DemoBookingError("Only a paid demo booking can join the flight", 409);
  if (booking.passengers.length) {
    const link = await passengerLink(db, booking.passengers[0].id);
    if (!link) throw new DemoBookingError("This booking already joined the flight", 409);
    return { passengerId: booking.passengers[0].id, link };
  }
  const d = await db.disruption.findFirst({ where: judgeRunId ? { judgeRunId, type: "CANCELLATION" } : { scenarioKey: JOIN_SCENARIO, isDemoData: true, judgeRunId: null }, include: { flight: true } });
  if (!d) throw new DemoBookingError("The demo flight is not set up. Run npm run reset-demo.", 409);
  const template = await db.passenger.findFirst({ where: { disruptionId: d.id, finalDestination: d.flight.destination, fareType: "PUBLIC", priorityReason: null }, orderBy: { manifestIndex: "asc" } });
  if (!template) throw new DemoBookingError("No template passenger on the demo flight", 409);

  const order = await getOrder(booking.paypalOrderId);
  const payer = (order.data as { payer?: { email_address?: string; name?: { given_name?: string; surname?: string } } } | null)?.payer;
  const last = await db.passenger.findFirst({ where: { disruptionId: d.id }, orderBy: { manifestIndex: "desc" }, select: { manifestIndex: true } });

  // The engine reads segments in its own shape; the booking page stores the sold flight only.
  await db.booking.update({ where: { id: booking.id }, data: { segments: [{ origin: d.flight.origin, destination: d.flight.destination, flown: false }] } });
  const p = await db.passenger.create({
    data: {
      bookingId: booking.id,
      disruptionId: d.id,
      manifestIndex: (last?.manifestIndex ?? 0) + 1,
      displayName: [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(" ") || `Demo booking ${booking.pnr}`,
      displayEmail: payer?.email_address ?? null,
      payoutReceiver: payer?.email_address ?? null,
      receiverKind: payer?.email_address ? "JUDGE_SANDBOX" : "NONE",
      fareType: "PUBLIC",
      firstDeparture: d.flight.origin,
      finalDestination: d.flight.destination,
      schedArrFinal: template.schedArrFinal,
      rerouting: template.rerouting ?? undefined,
      overnightStayNecessary: template.overnightStayNecessary,
    },
  });
  await recomputeEntitlements(db, d.id, [p.id]);
  await createOffers(db, d.id, [p.id]);
  await audit(db, { actorType: "PASSENGER", actorId: p.id, action: "DEMO_BOOKING_JOINED", entityType: "Disruption", entityId: d.id, summary: `Demo booking ${booking.pnr} (paid with PayPal sandbox) joined ${d.flight.flightNumber} as a passenger` });
  const link = await passengerLink(db, p.id);
  if (!link) throw new DemoBookingError("No passenger link was created", 500);
  return { passengerId: p.id, link };
}
