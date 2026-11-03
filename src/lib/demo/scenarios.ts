// Scenario definitions (docs/DEMO.md 2) and their resolution to UTC times.

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Airport } from "@/lib/engine";
import { zonedToUtc } from "./zoned";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const icao = z.string().regex(/^[A-Z]{4}$/);

const groupsSchema = z.strictObject({ public: z.number().int(), connecting: z.number().int(), award: z.number().int(), staff: z.number().int() });
const overlaysSchema = z.strictObject({
  reducedMobility: z.number().int(),
  unaccompaniedMinor: z.number().int(),
  unregistered: z.number().int(),
  noEmail: z.number().int(),
  refundCardPaid: z.number().int(),
});

export const scenarioSchema = z.strictObject({
  key: z.string(),
  title: z.string(),
  dateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateIsPlaceholder: z.boolean(),
  dateNote: z.string(),
  type: z.enum(["CANCELLATION", "DELAY"]),
  aircraft: z.strictObject({ registration: z.string(), type: z.string() }),
  flight: z.strictObject({ number: z.string(), origin: icao, destination: icao, depLocal: hhmm, arrLocal: hhmm, arrDayOffset: z.number().int() }),
  previousFlight: z.strictObject({ number: z.string(), origin: icao, destination: icao, depLocal: hhmm, arrLocal: hhmm, dayOffset: z.number().int() }),
  previousFlightNote: z.string().optional(),
  informed: z.strictObject({ local: hhmm, dayOffset: z.number().int() }),
  rerouting: z.strictObject({ number: z.string(), depLocal: hhmm, depDayOffset: z.number().int(), arrLocal: hhmm, arrDayOffset: z.number().int() }),
  onward: z.array(z.strictObject({ destination: icao, number: z.string(), depLocal: hhmm, arrLocal: hhmm, dayOffset: z.number().int() })),
  fareCents: z.number().int().positive(),
  opsNote: z.string(),
  maintenanceLog: z.string(),
  fullRun: z.strictObject({ groups: groupsSchema, overlays: overlaysSchema, note: z.string().optional() }),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export const SCENARIO_KEYS = ["A", "B"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export function loadScenario(key: ScenarioKey): Scenario {
  const file = path.join(process.cwd(), "data", "scenarios", `${key}.json`);
  return scenarioSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export interface ResolvedTimes {
  schedDep: Date;
  schedArr: Date;
  informedAt: Date;
  prevDep: Date;
  prevArr: Date;
  reroutingDep: Date;
  reroutingArr: Date;
  /** Onward connections by ICAO: scheduled arrival and the re-routed arrival (one day later). */
  onward: Record<string, { schedArrFinal: Date; reroutedArrFinal: Date }>;
}

/** All scenario times in UTC, using each airport's own zone. */
export function resolveTimes(s: Scenario, airports: ReadonlyMap<string, Airport>): ResolvedTimes {
  const tz = (code: string) => {
    const a = airports.get(code);
    if (!a) throw new Error(`Airport ${code} missing from data/airports.json`);
    return a.tz;
  };
  const f = s.flight;
  const p = s.previousFlight;
  const r = s.rerouting;
  const hub = f.destination;
  const reroutingArr = zonedToUtc(s.dateLocal, r.arrLocal, tz(hub), r.arrDayOffset);
  const onward: ResolvedTimes["onward"] = {};
  for (const o of s.onward) {
    const schedArrFinal = zonedToUtc(s.dateLocal, o.arrLocal, tz(o.destination), o.dayOffset);
    // The re-routed hub arrival misses the original connection, so the passenger takes the
    // same onward flight one day later.
    onward[o.destination] = { schedArrFinal, reroutedArrFinal: new Date(schedArrFinal.getTime() + 86_400_000) };
  }
  return {
    schedDep: zonedToUtc(s.dateLocal, f.depLocal, tz(f.origin)),
    schedArr: zonedToUtc(s.dateLocal, f.arrLocal, tz(hub), f.arrDayOffset),
    informedAt: zonedToUtc(s.dateLocal, s.informed.local, tz(f.origin), s.informed.dayOffset),
    prevDep: zonedToUtc(s.dateLocal, p.depLocal, tz(p.origin), p.dayOffset),
    prevArr: zonedToUtc(s.dateLocal, p.arrLocal, tz(p.destination), p.dayOffset),
    reroutingDep: zonedToUtc(s.dateLocal, r.depLocal, tz(f.origin), r.depDayOffset),
    reroutingArr,
    onward,
  };
}
