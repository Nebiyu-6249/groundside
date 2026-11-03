// A1 input for a demo scenario, built from the scenario definition and its weather fixtures.

import { loadScenario, resolveTimes, type ScenarioKey } from "@/lib/demo/scenarios";
import { loadAirports } from "@/lib/demo/seed";
import { loadScenarioWeather } from "@/lib/weather/scenario";
import type { A1Input } from "./assess";

export function scenarioA1Input(key: ScenarioKey): A1Input {
  const s = loadScenario(key);
  const t = resolveTimes(s, new Map(loadAirports().map((a) => [a.icao, a])));
  const weather = loadScenarioWeather(key);
  return {
    key: `scenario-${key}`,
    disruption: {
      flightNumber: s.flight.number,
      origin: s.flight.origin,
      destination: s.flight.destination,
      type: s.type,
      schedDepUtc: t.schedDep.toISOString(),
      schedArrUtc: t.schedArr.toISOString(),
      informedAtUtc: t.informedAt.toISOString(),
      previousFlight: { flightNumber: s.previousFlight.number, origin: s.previousFlight.origin, destination: s.previousFlight.destination, schedDepUtc: t.prevDep.toISOString(), schedArrUtc: t.prevArr.toISOString() },
    },
    opsNote: s.opsNote,
    maintenanceLog: s.maintenanceLog,
    otherEvidence: [],
    facts: weather.facts.map((f) => ({ id: f.id, text: f.text })),
    tafAvailable: weather.tafAvailable,
  };
}
