// Evidence and facts for a demo scenario, read from the saved fixtures (never fetched live).

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadScenario, resolveTimes, type ScenarioKey } from "@/lib/demo/scenarios";
import { loadAirports } from "@/lib/demo/seed";
import { buildFacts, parseFixture, type WeatherFact } from "./facts";
import type { ParsedMetar } from "./parse";
import { weatherWindows, type WeatherWindow } from "./windows";

const sidecarSchema = z.looseObject({
  source: z.string(),
  sourceUrl: z.string().url(),
  termsUrl: z.string().url(),
  retrievedAt: z.string(),
  sha256: z.string().length(64),
});

export interface WeatherEvidence {
  id: string;
  icao: string;
  kind: "METAR";
  raw: string;
  sourceUrl: string;
  source: string;
  retrievedAt: string;
  sha256: string;
}

export interface ScenarioWeather {
  windows: WeatherWindow[];
  evidence: WeatherEvidence[];
  facts: WeatherFact[];
  tafAvailable: false;
}

export function evidenceId(scenario: string, icao: string) {
  return `EV-${scenario}-${icao}-METAR`;
}

export function loadScenarioWeather(key: ScenarioKey): ScenarioWeather {
  const s = loadScenario(key);
  const t = resolveTimes(s, new Map(loadAirports().map((a) => [a.icao, a])));
  const windows = weatherWindows({
    origin: s.flight.origin,
    destination: s.flight.destination,
    schedDep: t.schedDep,
    schedArr: t.schedArr,
    cancelledAt: s.type === "CANCELLATION" ? t.informedAt : null,
    previous: { origin: s.previousFlight.origin, destination: s.previousFlight.destination, schedDep: t.prevDep, schedArr: t.prevArr },
  });
  const evidence: WeatherEvidence[] = [];
  const reports = new Map<string, { evidenceId: string; obs: ParsedMetar[] }>();
  for (const icao of [...new Set(windows.map((w) => w.icao))]) {
    const base = path.join(process.cwd(), "data", "weather", key, `${icao}-METAR`);
    const raw = readFileSync(`${base}.txt`, "utf8");
    const meta = sidecarSchema.parse(JSON.parse(readFileSync(`${base}.json`, "utf8")));
    const id = evidenceId(key, icao);
    evidence.push({ id, icao, kind: "METAR", raw, sourceUrl: meta.sourceUrl, source: meta.source, retrievedAt: meta.retrievedAt, sha256: meta.sha256 });
    reports.set(icao, { evidenceId: id, obs: parseFixture(raw) });
  }
  return { windows, evidence, facts: buildFacts(windows, reports), tafAvailable: false };
}
