// Passenger page data, looked up by the link token (only its SHA-256 is stored).

import type { PrismaClient } from "@/generated/prisma/client";
import { sha256 } from "@/lib/ops/decisions";
import { loadRulePack } from "@/lib/rules/pack";

export async function offerByToken(db: PrismaClient, token: string) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const offer = await db.offer.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      passenger: {
        include: {
          entitlements: { include: { payoutItems: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, updatedAt: true } } } },
          disruption: { include: { flight: { include: { originAirport: true, destinationAirport: true } }, decisions: true } },
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
    offer: { paymentChoice: offer.paymentChoice, paypalEmail: offer.paypalEmail, consentAt: offer.consentAt?.toISOString() ?? null, ibanLast4: offer.ibanLast4 },
    flight: { number: f.flightNumber, origin: f.originAirport.city, originIata: f.originAirport.iata, destination: f.destinationAirport.city, destinationIata: f.destinationAirport.iata, schedDep: f.schedDep.toISOString(), tz: f.originAirport.tz },
    type: p.disruption.type,
    careReleased: p.disruption.careReleasedAt !== null,
    decision: decision ? { kind: decision.kind, reason: decision.reason, citations: decision.citations.map((id) => ({ id, title: rules.get(id)?.title ?? id, summary: rules.get(id)?.summary ?? "" })) } : null,
    entitlements: p.entitlements.map((e) => ({
      kind: e.kind,
      amountCents: e.amountCents,
      status: e.status,
      payoutStatus: e.payoutItems[0]?.status ?? null,
      trace: (e.trace as { ruleId: string; outcome: string }[]).map((s) => ({ ruleId: s.ruleId, outcome: s.outcome, title: rules.get(s.ruleId)?.title ?? s.ruleId, kind: rules.get(s.ruleId)?.kind ?? "LAW" })),
    })),
  };
}

export type PassengerView = NonNullable<Awaited<ReturnType<typeof offerByToken>>>;
