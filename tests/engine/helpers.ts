import { readFileSync } from "node:fs";
import path from "node:path";
import { airlinePolicySchema, type Airport, type DisruptionInput, type EngineContext, type EntitlementKind, type PassengerInput, type PassengerResult } from "@/lib/engine";
import { loadRulePack, statusMap } from "@/lib/rules/pack";

const airportsFile = JSON.parse(readFileSync(path.join(process.cwd(), "data", "airports.json"), "utf8")) as { airports: Airport[] };
const AIRPORTS = new Map(airportsFile.airports.map((a) => [a.iata, a]));

export function ap(iata: string): Airport {
  const a = AIRPORTS.get(iata);
  if (!a) throw new Error(`Airport ${iata} not in data/airports.json`);
  return a;
}

export const policy = airlinePolicySchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data", "policy", "demo-air.json"), "utf8")));
export const rules = loadRulePack();
export const ctx: EngineContext = { rules: statusMap(rules), policy };

export const t = (s: string) => new Date(s);
export const addMin = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
export const DAY = 24 * 60;

/** Scenario A shape (docs/DEMO.md 2.2) on a placeholder winter date: DEMO 412 FRA-DXB cancelled. */
export function scenarioA(overrides: Partial<DisruptionInput> = {}): DisruptionInput {
  return {
    type: "CANCELLATION",
    flight: { origin: ap("FRA"), destination: ap("DXB"), schedDep: t("2026-01-15T20:50:00Z"), schedArr: t("2026-01-16T02:55:00Z") },
    informedAt: t("2026-01-15T19:30:00Z"),
    carrier: { isCommunityCarrier: true },
    decision: "COMPENSATION_APPROVED",
    decisionId: "dec-1",
    ...overrides,
  };
}

export function pax(d: DisruptionInput, overrides: Partial<PassengerInput> = {}): PassengerInput {
  return {
    firstDeparture: d.flight.origin,
    finalDestination: d.flight.destination,
    fareType: "PUBLIC",
    confirmedReservation: true,
    checkedInOnTime: true,
    schedArrFinal: d.flight.schedArr,
    choice: "UNDECIDED",
    booking: { totalCents: 18_900, segments: [{ origin: d.flight.origin.iata, destination: d.flight.destination.iata, flown: false }] },
    ...overrides,
  };
}

/** A cancellation informed `noticeMinutes` before departure, re-routed as given (relative minutes). */
export function cancelled(
  from: string,
  to: string,
  noticeMinutes: number,
  rerouting?: { depOffset: number; arrLate: number; accepted?: boolean },
  overrides: Partial<DisruptionInput> = {},
) {
  const schedDep = t("2026-03-10T08:00:00Z");
  const schedArr = addMin(schedDep, 150);
  const d: DisruptionInput = {
    type: "CANCELLATION",
    flight: { origin: ap(from), destination: ap(to), schedDep, schedArr },
    informedAt: addMin(schedDep, -noticeMinutes),
    carrier: { isCommunityCarrier: true },
    decision: "COMPENSATION_APPROVED",
    ...overrides,
  };
  const p = pax(d, {
    rerouting: rerouting
      ? { offered: true, accepted: rerouting.accepted ?? true, dep: addMin(schedDep, rerouting.depOffset), arrFinal: addMin(schedArr, rerouting.arrLate) }
      : undefined,
    choice: rerouting?.accepted === false ? "UNDECIDED" : rerouting ? "REROUTING" : "UNDECIDED",
  });
  return { d, p };
}

/** A delay: departure `depDelay` minutes late, first door open `arrDelay` minutes after scheduled arrival. */
export function delayed(from: string, to: string, depDelay: number, arrDelay: number | null, overrides: Partial<PassengerInput> = {}) {
  const schedDep = t("2026-03-10T08:00:00Z");
  const schedArr = addMin(schedDep, 120);
  const d: DisruptionInput = {
    type: "DELAY",
    flight: { origin: ap(from), destination: ap(to), schedDep, schedArr, expectedDep: addMin(schedDep, depDelay) },
    carrier: { isCommunityCarrier: true },
    decision: "COMPENSATION_APPROVED",
  };
  const p = pax(d, { arrFinalDoorOpen: arrDelay === null ? undefined : addMin(schedArr, arrDelay), ...overrides });
  return { d, p };
}

export function ent(r: PassengerResult, kind: EntitlementKind) {
  const e = r.entitlements.find((x) => x.kind === kind);
  if (!e) throw new Error(`No ${kind} entitlement`);
  return e;
}

export const eur = (r: PassengerResult, kind: EntitlementKind) => ent(r, kind).amountCents / 100;
export const cites = (r: PassengerResult, kind: EntitlementKind, ruleId: string) => ent(r, kind).trace.some((s) => s.ruleId === ruleId);
