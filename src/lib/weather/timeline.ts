// Weather timeline data (SPEC 7.5): visibility, lowest runway visual range and ceiling per
// airport from the stored METAR evidence, with the flight times that matter at that airport.

import { parseFixture } from "./facts";

export interface TimelinePoint {
  t: number;
  /** Prevailing visibility in metres, capped at 10000 (reported as 9999 for 10 km or more). */
  visibilityM: number | null;
  /** Lowest runway visual range reported, metres. */
  rvrM: number | null;
  /** Lowest broken or overcast layer, feet; null when no ceiling was reported. */
  ceilingFt: number | null;
  raw: string;
}

export interface TimelineMarker { t: number; label: string }

export interface AirportTimeline {
  icao: string;
  roles: string[];
  points: TimelinePoint[];
  markers: TimelineMarker[];
}

export interface TimelineFlight {
  number: string;
  schedDep: Date;
  schedArr: Date;
  actualDep: Date | null;
  previous: { number: string; schedDep: Date; schedArr: Date } | null;
}

export function airportTimeline(evidence: { airportIcao: string | null; raw: string; parsed: unknown }, flight: TimelineFlight): AirportTimeline | null {
  if (!evidence.airportIcao) return null;
  const roles = ((evidence.parsed as { roles?: string[] } | null)?.roles ?? []) as string[];
  const points = parseFixture(evidence.raw)
    .map((o) => ({
      t: o.observedAt.getTime(),
      visibilityM: o.cavok ? 10000 : o.visibilityM === null ? null : Math.min(o.visibilityM >= 9999 ? 10000 : o.visibilityM, 10000),
      rvrM: o.rvr.length ? Math.min(...o.rvr.map((r) => r.minM)) : null,
      ceilingFt: o.ceilingFt,
      raw: o.raw,
    }))
    .sort((a, b) => a.t - b.t);
  const markers: TimelineMarker[] = [];
  if (roles.includes("DEPARTURE")) {
    markers.push({ t: flight.schedDep.getTime(), label: `${flight.number} scheduled departure` });
    if (flight.actualDep) markers.push({ t: flight.actualDep.getTime(), label: `${flight.number} actual departure` });
  }
  if (roles.includes("ARRIVAL")) markers.push({ t: flight.schedArr.getTime(), label: `${flight.number} scheduled arrival` });
  if (flight.previous && roles.includes("PREV_DEPARTURE")) markers.push({ t: flight.previous.schedDep.getTime(), label: `${flight.previous.number} scheduled departure` });
  if (flight.previous && roles.includes("PREV_ARRIVAL")) markers.push({ t: flight.previous.schedArr.getTime(), label: `${flight.previous.number} scheduled arrival` });
  return { icao: evidence.airportIcao, roles, points, markers };
}
