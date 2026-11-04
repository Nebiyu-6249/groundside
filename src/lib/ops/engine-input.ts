// Maps database rows to engine inputs and writes engine results back (SPEC 5.8). The engine
// itself stays pure; this module is the only place that loads and saves for it.

import type { PrismaClient } from "@/generated/prisma/client";
import { computePassenger, reconcile, type Airport, type BookingSegment, type DisruptionInput, type EntitlementResult, type PassengerInput, type PassengerResult } from "@/lib/engine";
import { loadPolicy } from "@/lib/demo/seed";
import { loadRulePack, statusMap } from "@/lib/rules/pack";
import { audit } from "./audit";

type Db = PrismaClient;

export async function loadDisruption(db: Db, disruptionId: string) {
  return db.disruption.findUniqueOrThrow({
    where: { id: disruptionId },
    include: {
      flight: { include: { originAirport: true, destinationAirport: true, airline: true, previousFlight: true } },
      decisions: true,
    },
  });
}
export type DisruptionRow = Awaited<ReturnType<typeof loadDisruption>>;

const toAirport = (a: { icao: string; iata: string; name: string; city: string; country: string; lat: number; lon: number; tz: string; scope: string }): Airport => ({ ...a, scope: a.scope as Airport["scope"] });

export function disruptionInput(d: DisruptionRow): DisruptionInput {
  const decision = d.decisions[0];
  return {
    type: d.type,
    flight: {
      origin: toAirport(d.flight.originAirport),
      destination: toAirport(d.flight.destinationAirport),
      schedDep: d.flight.schedDep,
      schedArr: d.flight.schedArr,
      expectedDep: d.flight.actualDep ?? undefined,
    },
    informedAt: d.informedAt ?? undefined,
    carrier: { isCommunityCarrier: d.flight.airline.isCommunityCarrier },
    decision: !decision ? "PENDING" : decision.kind === "APPROVE_COMPENSATION" ? "COMPENSATION_APPROVED" : "DENIAL_SIGNED",
    decisionId: decision?.id,
  };
}

interface ReroutingJson { offered?: boolean; dep?: string; arrFinal?: string }

export function passengerInput(
  p: { fareType: PassengerInput["fareType"]; confirmedReservation: boolean; checkedInOnTime: boolean; firstDeparture: string; finalDestination: string; schedArrFinal: Date; arrFinalDoorOpen: Date | null; rerouting: unknown; choice: PassengerInput["choice"]; priorityReason: PassengerInput["priorityReason"]; overnightStayNecessary: boolean; journeyNoLongerServesPurpose: boolean; booking: { totalCents: number; segments: unknown } },
  airports: ReadonlyMap<string, Airport>,
): PassengerInput {
  const r = (p.rerouting ?? null) as ReroutingJson | null;
  const ap = (icao: string) => {
    const a = airports.get(icao);
    if (!a) throw new Error(`Airport ${icao} is not in the database`);
    return a;
  };
  return {
    firstDeparture: ap(p.firstDeparture),
    finalDestination: ap(p.finalDestination),
    fareType: p.fareType,
    confirmedReservation: p.confirmedReservation,
    checkedInOnTime: p.checkedInOnTime,
    schedArrFinal: p.schedArrFinal,
    arrFinalDoorOpen: p.arrFinalDoorOpen ?? undefined,
    rerouting: r?.dep && r.arrFinal ? { offered: r.offered !== false, accepted: p.choice === "REROUTING", dep: new Date(r.dep), arrFinal: new Date(r.arrFinal) } : undefined,
    choice: p.choice,
    priorityReason: p.priorityReason,
    overnightStayNecessary: p.overnightStayNecessary,
    booking: { totalCents: p.booking.totalCents, segments: (p.booking.segments as BookingSegment[] | null) ?? [], journeyNoLongerServesPurpose: p.journeyNoLongerServesPurpose },
  };
}

export function engineContext() {
  return { rules: statusMap(loadRulePack()), policy: loadPolicy() };
}

/** Engine results for every passenger of a disruption, without saving anything. */
export async function computeDisruption(db: Db, disruptionId: string): Promise<{ passengerId: string; result: PassengerResult }[]> {
  const d = await loadDisruption(db, disruptionId);
  const airports = new Map((await db.airport.findMany()).map((a) => [a.icao, toAirport(a)]));
  const passengers = await db.passenger.findMany({ where: { disruptionId }, include: { booking: true }, orderBy: { manifestIndex: "asc" } });
  const di = disruptionInput(d);
  const ctx = engineContext();
  return passengers.map((p) => ({ passengerId: p.id, result: computePassenger(di, passengerInput(p, airports), ctx) }));
}

const row = (passengerId: string, e: EntitlementResult) => ({
  passengerId,
  kind: e.kind,
  amountCents: e.amountCents,
  currency: e.currency,
  status: e.status,
  trace: JSON.parse(JSON.stringify(e.trace)),
  engineVersion: e.engineVersion,
  needsHumanCheckReason: e.needsHumanCheckReason,
});

/**
 * Re-runs the engine and merges the result (SPEC 5.8): unpaid entitlements are updated, paid or
 * in-flight ones are never touched, and differences on those are audited as conflicts.
 * Offer progress (OFFERED, ACCEPTED) is kept when only the amount is refreshed.
 */
export async function recomputeEntitlements(db: Db, disruptionId: string): Promise<{ created: number; updated: number; conflicts: number }> {
  const computed = await computeDisruption(db, disruptionId);
  let created = 0;
  let updated = 0;
  let conflicts = 0;
  for (const { passengerId, result } of computed) {
    const stored = await db.entitlement.findMany({ where: { passengerId }, include: { payoutItems: { select: { status: true } } } });
    const actions = reconcile(
      stored.map((s) => ({ id: s.id, kind: s.kind, status: s.status, amountCents: s.amountCents, payoutInFlight: s.payoutItems.some((i) => !FINAL_NO_MONEY.has(i.status) && i.status !== "SUCCESS") })),
      result.entitlements,
    );
    for (const a of actions) {
      if (a.action === "CREATE") {
        await db.entitlement.create({ data: row(passengerId, a.next) });
        created++;
      } else if (a.action === "UPDATE") {
        const current = stored.find((s) => s.id === a.id)!;
        // An offer in progress keeps its status unless the engine now says not owed or needs a check.
        const keep = (current.status === "OFFERED" || current.status === "ACCEPTED") && (a.next.status === "READY" || a.next.status === "OFFERED");
        await db.entitlement.update({ where: { id: a.id }, data: { ...row(passengerId, a.next), status: keep ? current.status : a.next.status } });
        updated++;
      } else if (a.action === "CONFLICT") {
        conflicts++;
        await audit(db, { actorType: "SYSTEM", action: "ENGINE_CONFLICT", entityType: "Entitlement", entityId: a.id, summary: a.reason, data: { stored: a.storedAmountCents, computed: a.computedAmountCents } });
      }
    }
  }
  return { created, updated, conflicts };
}

/** Payout item statuses where no money reached the passenger, so a new item may be created. */
export const FINAL_NO_MONEY = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "CANCELED"]);
