// Passenger page data, looked up by the link token (only its SHA-256 is stored).

import type { PrismaClient } from "@/generated/prisma/client";
import { sha256 } from "@/lib/ops/decisions";
import { loadRulePack } from "@/lib/rules/pack";
import { displayTitle } from "@/lib/rules/display";

export async function offerByToken(db: PrismaClient, token: string) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const offer = await db.offer.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      passenger: {
        include: {
          entitlements: { include: { payoutItems: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, updatedAt: true, receiver: true, amountCents: true, createdAt: true } } } },
          disruption: { include: { flight: { include: { originAirport: true, destinationAirport: true } }, decisions: true } },
          receipts: { orderBy: { createdAt: "desc" }, select: { id: true, decision: true, approvedCents: true, extracted: true, checks: true, demoDateOverride: true, createdAt: true, payoutItems: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } } },
          qaMessages: { orderBy: { createdAt: "asc" }, take: 40, select: { role: true, text: true } },
          tickets: { where: { status: "OPEN" }, take: 1, select: { id: true } },
          booking: { select: { paymentMethod: true, paypalCaptureId: true, refunds: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, paypalRefundId: true } } } },
        },
      },
    },
  });
  if (!offer || offer.expiresAt < new Date()) return null;
  const p = offer.passenger;
  const f = p.disruption.flight;
  const rules = new Map(loadRulePack().map((r) => [r.id, r]));
  const decision = p.disruption.decisions[0] ?? null;
  return {
    passengerId: p.id,
    name: p.displayName,
    receiver: p.payoutReceiver,
    receiverKind: p.receiverKind,
    choice: p.choice,
    offer: { paymentChoice: offer.paymentChoice, paypalEmail: offer.paypalEmail, consentAt: offer.consentAt?.toISOString() ?? null, ibanLast4: offer.ibanLast4, bankSwitchRequested: offer.bankSwitchRequestedAt !== null },
    unclaimed: p.entitlements.flatMap((e) => e.payoutItems.filter((i) => i.status === "UNCLAIMED").map((i) => ({ amountCents: i.amountCents, receiver: i.receiver, claimBy: new Date(i.createdAt.getTime() + 30 * 86_400_000).toISOString() }))),
    flight: { number: f.flightNumber, origin: f.originAirport.city, originIata: f.originAirport.iata, destination: f.destinationAirport.city, destinationIata: f.destinationAirport.iata, schedDep: f.schedDep.toISOString(), tz: f.originAirport.tz },
    type: p.disruption.type,
    careReleased: p.disruption.careReleasedAt !== null,
    disruptionId: p.disruptionId,
    refundToPaypal: p.booking.paymentMethod === "PAYPAL" && p.booking.paypalCaptureId !== null,
    refundStatus: p.booking.refunds[0]?.status ?? null,
    qa: p.qaMessages.map((m) => ({ role: m.role, text: m.text })),
    ticketOpen: p.tickets.length > 0,
    receipts: p.receipts.map((r) => {
      const x = r.extracted as { merchantName?: string | null; total?: number | null; currency?: string | null; date?: string | null } | null;
      const c = r.checks as { outcome?: { reason?: string } } | null;
      return { id: r.id, decision: r.decision, approvedCents: r.approvedCents, merchant: x?.merchantName ?? null, total: x?.total ?? null, currency: x?.currency ?? null, printedDate: x?.date ?? null, dateReplaced: r.demoDateOverride !== null, reason: c?.outcome?.reason ?? null, payoutStatus: r.payoutItems[0]?.status ?? null, at: r.createdAt.toISOString() };
    }),
    decision: decision ? { kind: decision.kind, reason: decision.reason, citations: decision.citations.map((id) => ({ id, title: rules.get(id) ? displayTitle(rules.get(id)!) : id, summary: rules.get(id)?.summary ?? "" })) } : null,
    entitlements: p.entitlements.map((e) => ({
      kind: e.kind,
      amountCents: e.amountCents,
      status: e.status,
      payoutStatus: e.payoutItems[0]?.status ?? null,
      trace: (e.trace as { ruleId: string; outcome: string }[]).map((s) => ({ ruleId: s.ruleId, outcome: s.outcome, title: rules.get(s.ruleId) ? displayTitle(rules.get(s.ruleId)!) : s.ruleId, kind: rules.get(s.ruleId)?.kind ?? "LAW" })),
    })),
  };
}

/** Why this passenger's accepted payments are waiting, if they are (demo cap or sandbox balance). */
export async function passengerHold(db: PrismaClient, passengerId: string, capCents: number) {
  const { payoutHold } = await import("@/lib/payouts/limits");
  const hold = await payoutHold(db, capCents);
  if (!hold) return null;
  const waiting = await db.entitlement.count({ where: { passengerId, kind: { in: ["COMPENSATION", "MEAL_ALLOWANCE"] }, status: "ACCEPTED", amountCents: { gt: 0 }, payoutItems: { none: { status: { notIn: ["FAILED", "RETURNED", "BLOCKED", "CANCELED", "DENIED", "REFUNDED", "REVERSED"] } } } } });
  return waiting > 0 ? hold : null;
}

export type PassengerView = NonNullable<Awaited<ReturnType<typeof offerByToken>>>;
