// Turns parsed reports into numbered facts (docs/SPEC.md 7.4). The AI may refer only to these
// IDs. Wording is neutral: facts describe what was reported, never whether a flight was possible.

import { parseMetarReport, significantWeather, type ParsedMetar, type ParsedTaf } from "./parse";
import type { WeatherWindow, WindowRole } from "./windows";

export type FactKind = "VISIBILITY_M" | "RVR_M" | "CEILING_FT" | "PRESENT_WEATHER" | "WIND" | "CAVOK" | "TAF_PERIOD" | "INDICATOR";

export interface WeatherFact {
  id: string;
  airport: string;
  observedAt: string;
  kind: FactKind;
  value: string | number | boolean | Record<string, unknown> | null;
  text: string;
  sourceEvidenceId: string;
}

/** Reference values for indicator wording only. They are not operating minima. */
export const REFERENCE = { rvrM: 550, visibilityFogM: 1000, ceilingFt: 200 };

const ROLE_LABEL: Record<WindowRole, string> = {
  DEPARTURE: "departure window",
  ARRIVAL: "arrival window",
  PREV_DEPARTURE: "previous flight's departure window",
  PREV_ARRIVAL: "previous flight's arrival window",
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").slice(0, 13) + "Z";
const hhmm = (d: Date) => d.toISOString().slice(11, 16).replace(":", "") + "Z";
const visText = (m: number) => (m >= 9999 ? "10 km or more" : m >= 5000 ? `${Math.round(m / 1000)} km` : `${m} m`);

/** Parses a fixture file: each line is "<ISO timestamp> <raw METAR>". */
export function parseFixture(text: string): ParsedMetar[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const [ts, ...raw] = line.trim().split(" ");
      return parseMetarReport(raw.join(" "), new Date(ts.replace(/Z$/, ":00Z").replace(/:00:00Z$/, ":00Z")));
    });
}

function observationFacts(o: ParsedMetar, evidenceId: string): WeatherFact[] {
  const base = `WX-${o.station}-${stamp(o.observedAt)}`;
  const at = o.observedAt.toISOString();
  const t = hhmm(o.observedAt);
  const facts: WeatherFact[] = [];
  const add = (suffix: string, kind: FactKind, value: WeatherFact["value"], text: string) =>
    facts.push({ id: `${base}-${suffix}`, airport: o.station, observedAt: at, kind, value, text: `${o.station} ${t}: ${text}`, sourceEvidenceId: evidenceId });

  if (o.cavok) add("CAVOK", "CAVOK", true, "CAVOK (visibility 10 km or more, no cloud below 5000 ft, no significant weather)");
  if (o.visibilityM !== null) add("VIS", "VISIBILITY_M", o.visibilityM, `visibility ${visText(o.visibilityM)}`);
  for (const r of o.rvr) add(`RVR-${r.runway}`, "RVR_M", r.minM, `RVR runway ${r.runway} ${r.minM} m${r.maxM !== null ? ` varying to ${r.maxM} m` : ""}`);
  if (!o.cavok) add("CEIL", "CEILING_FT", o.ceilingFt, o.ceilingFt === null ? "no cloud ceiling reported" : `ceiling ${o.ceilingFt} ft`);
  if (o.weather.length) add("WX", "PRESENT_WEATHER", o.weather.join(" "), `present weather ${o.weather.join(" ")}`);
  if (o.windKt !== null) add("WIND", "WIND", { deg: o.windDeg, kt: o.windKt, gustKt: o.gustKt }, `wind ${o.windDeg === null ? "variable" : `${o.windDeg} degrees`} ${o.windKt} kt${o.gustKt ? ` gusting ${o.gustKt} kt` : ""}`);
  return facts;
}

/** Derived facts for one window: lowest values and a statement about significant weather. */
function indicatorFacts(obs: ParsedMetar[], w: WeatherWindow, evidenceId: string): WeatherFact[] {
  const base = `WX-${w.icao}-${w.role}`;
  const label = `${ROLE_LABEL[w.role]} (${hhmm(w.from)} to ${hhmm(w.to)})`;
  const at = w.from.toISOString();
  const facts: WeatherFact[] = [];
  const add = (suffix: string, value: WeatherFact["value"], text: string) => facts.push({ id: `${base}-${suffix}`, airport: w.icao, observedAt: at, kind: "INDICATOR", value, text, sourceEvidenceId: evidenceId });

  if (obs.length === 0) {
    add("NODATA", null, `No reports from ${w.icao} in the ${label}`);
    return facts;
  }
  add("COUNT", obs.length, `${obs.length} reports from ${w.icao} in the ${label}`);
  const vis = obs.map((o) => o.visibilityM).filter((v): v is number => v !== null);
  if (vis.length) add("MINVIS", Math.min(...vis), `Lowest visibility at ${w.icao} in the ${label}: ${visText(Math.min(...vis))}`);
  const rvr = obs.flatMap((o) => o.rvr.map((r) => r.minM));
  if (rvr.length) {
    const min = Math.min(...rvr);
    add("MINRVR", min, `Lowest RVR at ${w.icao} in the ${label}: ${min} m (${min < REFERENCE.rvrM ? "below" : "at or above"} the ${REFERENCE.rvrM} m reference value, which is not an operating minimum)`);
  }
  const ceilings = obs.map((o) => o.ceilingFt).filter((c): c is number => c !== null);
  add("MINCEIL", ceilings.length ? Math.min(...ceilings) : null, ceilings.length ? `Lowest ceiling at ${w.icao} in the ${label}: ${Math.min(...ceilings)} ft` : `No cloud ceiling reported at ${w.icao} in the ${label}`);

  const sig = [...new Set(obs.flatMap((o) => significantWeather(o.weather)))];
  add(
    "SIGWX",
    sig.length ? sig.join(" ") : null,
    sig.length
      ? `Significant weather reported at ${w.icao} in the ${label}: ${sig.join(", ")}`
      : `No fog, thunderstorm, snow or freezing precipitation reported at ${w.icao} in the ${label}`,
  );
  // Longest run of consecutive reports with fog and visibility under 1000 m.
  let run = 0;
  let best = 0;
  let bestStart: Date | null = null;
  let bestEnd: Date | null = null;
  let start: Date | null = null;
  for (const o of obs) {
    const fog = o.weather.some((x) => x.includes("FG") && !/^(BC|MI|PR|VC)/.test(x)) && (o.visibilityM ?? 9999) < REFERENCE.visibilityFogM;
    if (fog) {
      run += 1;
      start ??= o.observedAt;
      if (run > best) { best = run; bestStart = start; bestEnd = o.observedAt; }
    } else { run = 0; start = null; }
  }
  if (bestStart && bestEnd) {
    add("FOGSPAN", { from: bestStart.toISOString(), to: bestEnd.toISOString(), reports: best }, `Fog with visibility under ${REFERENCE.visibilityFogM} m reported at ${w.icao} in ${best} consecutive reports from ${hhmm(bestStart)} to ${hhmm(bestEnd)}`);
  }
  return facts;
}

/** One TAF_PERIOD fact per forecast period (base and change groups). */
export function tafFacts(taf: ParsedTaf, evidenceId: string, issuedAt: Date): WeatherFact[] {
  return taf.periods.map((p, i) => {
    const parts = [
      p.visibilityM !== null ? `visibility ${visText(p.visibilityM)}` : null,
      p.ceilingFt !== null ? `ceiling ${p.ceilingFt} ft` : "no ceiling forecast",
      p.weather.length ? `weather ${p.weather.join(" ")}` : "no significant weather forecast",
    ].filter(Boolean);
    return {
      id: `TAF-${taf.station}-${stamp(issuedAt)}-P${i}`,
      airport: taf.station,
      observedAt: issuedAt.toISOString(),
      kind: "TAF_PERIOD" as const,
      value: { kind: p.kind, from: p.from, to: p.to, visibilityM: p.visibilityM, ceilingFt: p.ceilingFt, weather: p.weather },
      text: `${taf.station} forecast issued ${hhmm(issuedAt)}, ${p.kind === "BASE" ? "base period" : p.kind} ${p.from ?? "?"} to ${p.to ?? "?"} (DDHH): ${parts.join(", ")}`,
      sourceEvidenceId: evidenceId,
    };
  });
}

/**
 * Facts for a set of windows. `reports` maps ICAO to parsed reports and the evidence ID they
 * came from. Observation facts are kept only inside at least one window.
 */
export function buildFacts(windows: readonly WeatherWindow[], reports: ReadonlyMap<string, { evidenceId: string; obs: ParsedMetar[] }>): WeatherFact[] {
  const facts = new Map<string, WeatherFact>();
  for (const w of windows) {
    const source = reports.get(w.icao);
    const inWindow = (source?.obs ?? []).filter((o) => o.observedAt >= w.from && o.observedAt <= w.to);
    for (const o of inWindow) for (const f of observationFacts(o, source!.evidenceId)) facts.set(f.id, f);
    for (const f of indicatorFacts(inWindow, w, source?.evidenceId ?? "none")) facts.set(f.id, f);
  }
  return [...facts.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
}
