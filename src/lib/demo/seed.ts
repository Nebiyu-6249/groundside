// Seeds and resets the owner's demo data: reference data, scenarios A and B, synthetic
// passengers and their engine-computed entitlements. Judge runs (Phase 5) are not touched.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { airlinePolicySchema, computePassenger, type Airport, type DisruptionInput, type PassengerInput } from "@/lib/engine";
import { seedUsers } from "@/lib/auth/users";
import { loadRulePack, statusMap } from "@/lib/rules/pack";
import { fullManifest, payoutReceiver, quickManifest, seededRandom, type ManifestEntry } from "./manifest";
import { loadScenarioWeather } from "@/lib/weather/scenario";
import { loadScenario, resolveTimes, SCENARIO_KEYS, type Scenario, type ScenarioKey } from "./scenarios";

export type SeedSize = "QUICK" | "FULL";

export const DEMO_AIRLINE = { code: "DEMO", name: "Demo Air (fictional carrier)", isCommunityCarrier: true } as const;

export function loadAirports(): Airport[] {
  const file = JSON.parse(readFileSync(path.join(process.cwd(), "data", "airports.json"), "utf8")) as { airports: Airport[] };
  return file.airports;
}

export function loadPolicy() {
  return airlinePolicySchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data", "policy", "demo-air.json"), "utf8")));
}

/** Removes the owner's demo disruptions and everything hanging off them. Phase 0 demo bookings stay. */
export async function resetDemo(db: PrismaClient): Promise<{ disruptions: number }> {
  const disruptions = await db.disruption.findMany({ where: { isDemoData: true, judgeRunId: null }, select: { id: true, flightId: true, flight: { select: { previousFlightId: true } } } });
  if (disruptions.length === 0) return { disruptions: 0 };
  const ids = disruptions.map((d) => d.id);
  const passengers = await db.passenger.findMany({ where: { disruptionId: { in: ids } }, select: { id: true, bookingId: true } });
  const passengerIds = passengers.map((p) => p.id);
  const bookingIds = [...new Set(passengers.map((p) => p.bookingId))];
  const flightIds = disruptions.flatMap((d) => [d.flightId, d.flight.previousFlightId]).filter((x): x is string => x !== null);

  const demoItems = await db.payoutItem.findMany({ where: { entitlement: { passengerId: { in: passengerIds } } }, select: { batchId: true } });
  const batchIds = [...new Set(demoItems.map((i) => i.batchId))];

  await db.$transaction([
    // Payout rows do not cascade from entitlements on purpose: money records are never removed
    // by accident. A demo reset removes them explicitly.
    db.payoutItem.deleteMany({ where: { entitlement: { passengerId: { in: passengerIds } } } }),
    db.payoutBatch.deleteMany({ where: { id: { in: batchIds }, items: { none: {} } } }),
    db.disruption.deleteMany({ where: { id: { in: ids } } }),
    // Bookings paid on the demo booking page hold real sandbox captures and refunds: they are
    // kept, and only leave the flight they joined.
    db.refund.deleteMany({ where: { bookingId: { in: bookingIds }, booking: { paypalOrderId: null } } }),
    db.booking.deleteMany({ where: { id: { in: bookingIds }, paypalOrderId: null, passengers: { none: {} } } }),
    db.flight.deleteMany({ where: { id: { in: flightIds }, disruptions: { none: {} } } }),
  ]);
  return { disruptions: ids.length };
}

function pnr(random: () => number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Ops note, maintenance log and the archived weather fixtures, with their facts. */
async function seedEvidence(db: PrismaClient, disruptionId: string, scenario: Scenario) {
  const docs = [
    { kind: "OPS_NOTE" as const, raw: scenario.opsNote },
    { kind: "MAINTENANCE_LOG" as const, raw: scenario.maintenanceLog },
  ];
  for (const d of docs) await db.evidence.create({ data: { disruptionId, kind: d.kind, raw: d.raw, sha256: sha256(d.raw) } });
  if (scenario.dateIsPlaceholder) return;

  const weather = loadScenarioWeather(scenario.key as ScenarioKey);
  const idMap = new Map<string, string>();
  for (const e of weather.evidence) {
    const roles = weather.windows.filter((w) => w.icao === e.icao).map((w) => w.role);
    const row = await db.evidence.create({
      data: {
        disruptionId, kind: "METAR", airportIcao: e.icao, role: roles[0], raw: e.raw,
        parsed: { roles, source: e.source }, sourceUrl: e.sourceUrl, retrievedAt: new Date(e.retrievedAt), sha256: e.sha256,
      },
    });
    idMap.set(e.id, row.id);
  }
  await db.fact.createMany({
    data: weather.facts.map((f) => ({
      id: f.id, disruptionId, evidenceId: idMap.get(f.sourceEvidenceId)!, airportIcao: f.airport,
      // Stored as { value } so scalars, null and objects share one JSON shape.
      observedAt: new Date(f.observedAt), kind: f.kind, value: JSON.parse(JSON.stringify({ value: f.value })), text: f.text,
    })),
  });
  await db.disruption.update({ where: { id: disruptionId }, data: { status: "EVIDENCE_READY" } });
}

interface SeedOptions {
  size: SeedSize;
  pool: readonly string[];
  unregisteredPattern: string;
}

async function seedScenario(db: PrismaClient, scenario: Scenario, airlineId: string, airports: Map<string, Airport>, opts: SeedOptions) {
  const times = resolveTimes(scenario, airports);
  const origin = airports.get(scenario.flight.origin)!;
  const destination = airports.get(scenario.flight.destination)!;
  const aircraft = await db.aircraft.upsert({
    where: { registration: scenario.aircraft.registration },
    create: scenario.aircraft,
    update: { type: scenario.aircraft.type },
  });

  const previous = await db.flight.create({
    data: {
      flightNumber: scenario.previousFlight.number, airlineId, aircraftId: aircraft.id,
      origin: scenario.previousFlight.origin, destination: scenario.previousFlight.destination,
      schedDep: times.prevDep, schedArr: times.prevArr, actualDep: times.prevDep, actualArrDoorOpen: times.prevArr, status: "OPERATED",
    },
  });
  const flight = await db.flight.create({
    data: {
      flightNumber: scenario.flight.number, airlineId, aircraftId: aircraft.id,
      origin: origin.icao, destination: destination.icao, schedDep: times.schedDep, schedArr: times.schedArr,
      status: scenario.type === "CANCELLATION" ? "CANCELLED" : "DELAYED", previousFlightId: previous.id,
    },
  });
  const disruption = await db.disruption.create({
    data: {
      flightId: flight.id, scenarioKey: scenario.key, type: scenario.type, informedAt: times.informedAt,
      opsNote: scenario.opsNote, maintenanceLog: scenario.maintenanceLog, status: "DRAFT", isDemoData: true,
    },
  });
  await seedEvidence(db, disruption.id, scenario);

  const manifest: ManifestEntry[] = opts.size === "FULL" ? fullManifest(scenario) : quickManifest(scenario);
  const random = seededRandom(scenario.key.charCodeAt(0) * 1000 + manifest.length);
  // Connecting bookings split the fare 70/30 between the two segments (demo data).
  const segmentsFor = (e: ManifestEntry) => {
    if (e.finalDestination === destination.icao) {
      return [{ origin: origin.icao, destination: destination.icao, flown: false, priceCents: scenario.fareCents }];
    }
    const first = Math.round(scenario.fareCents * 0.7);
    return [
      { origin: origin.icao, destination: destination.icao, flown: false, priceCents: first },
      { origin: destination.icao, destination: e.finalDestination, flown: false, priceCents: scenario.fareCents - first },
    ];
  };
  const bookings = await db.booking.createManyAndReturn({
    data: manifest.map((e) => ({ pnr: pnr(random), totalCents: scenario.fareCents, currency: "EUR", paymentMethod: e.paymentMethod, segments: segmentsFor(e) })),
    select: { id: true },
  });

  const ctx = { rules: statusMap(loadRulePack()), policy: loadPolicy() };
  const disruptionInput: DisruptionInput = {
    type: scenario.type,
    flight: { origin, destination, schedDep: times.schedDep, schedArr: times.schedArr },
    informedAt: times.informedAt,
    carrier: { isCommunityCarrier: DEMO_AIRLINE.isCommunityCarrier },
    decision: "PENDING",
  };

  const passengerRows = manifest.map((e, i) => {
    const onward = times.onward[e.finalDestination];
    const schedArrFinal = onward?.schedArrFinal ?? times.schedArr;
    const reroutedArrFinal = onward?.reroutedArrFinal ?? times.reroutingArr;
    return {
      bookingId: bookings[i].id,
      disruptionId: disruption.id,
      manifestIndex: e.index,
      displayName: e.displayName,
      displayEmail: e.displayEmail,
      payoutReceiver: payoutReceiver(e, opts.pool, opts.unregisteredPattern),
      receiverKind: e.receiverKind,
      fareType: e.fareType,
      firstDeparture: origin.icao,
      finalDestination: e.finalDestination,
      schedArrFinal,
      rerouting: { number: scenario.rerouting.number, offered: true, accepted: false, dep: times.reroutingDep.toISOString(), arrFinal: reroutedArrFinal.toISOString() },
      choice: e.choice,
      priorityReason: e.priorityReason,
    };
  });
  const passengers = await db.passenger.createManyAndReturn({ data: passengerRows, select: { id: true, manifestIndex: true } });

  const entitlementRows = passengers.flatMap((row) => {
    const p = passengerRows.find((x) => x.manifestIndex === row.manifestIndex)!;
    const input: PassengerInput = {
      firstDeparture: origin,
      finalDestination: airports.get(p.finalDestination)!,
      fareType: p.fareType,
      confirmedReservation: true,
      checkedInOnTime: true,
      schedArrFinal: p.schedArrFinal,
      rerouting: { offered: true, accepted: false, dep: times.reroutingDep, arrFinal: new Date(p.rerouting.arrFinal) },
      choice: p.choice,
      priorityReason: p.priorityReason,
      booking: { totalCents: scenario.fareCents, segments: segmentsFor(manifest[row.manifestIndex]) },
    };
    return computePassenger(disruptionInput, input, ctx).entitlements.map((e) => ({
      passengerId: row.id,
      kind: e.kind,
      amountCents: e.amountCents,
      currency: e.currency,
      status: e.status,
      trace: e.trace as object[],
      engineVersion: e.engineVersion,
      needsHumanCheckReason: e.needsHumanCheckReason,
    }));
  });
  await db.entitlement.createMany({ data: entitlementRows });
  return { scenario: scenario.key, disruptionId: disruption.id, passengers: passengers.length, entitlements: entitlementRows.length };
}

export async function seedDemo(db: PrismaClient, opts: SeedOptions) {
  const users = await seedUsers(db);
  const airports = loadAirports();
  for (const a of airports) {
    await db.airport.upsert({ where: { icao: a.icao }, create: a, update: a });
  }
  const policy = loadPolicy();
  const airline = await db.airline.upsert({
    where: { code: DEMO_AIRLINE.code },
    create: { ...DEMO_AIRLINE, policy },
    update: { name: DEMO_AIRLINE.name, isCommunityCarrier: DEMO_AIRLINE.isCommunityCarrier, policy },
  });
  const byIcao = new Map(airports.map((a) => [a.icao, a]));
  const results = [];
  for (const key of SCENARIO_KEYS) {
    results.push(await seedScenario(db, loadScenario(key), airline.id, byIcao, opts));
  }
  return { users, scenarios: results };
}
