// METAR and TAF parsing (docs/SPEC.md 7.2) on top of metar-taf-parser, normalised to the
// fields the fact builder needs. Visibility is in metres, cloud heights and ceilings in feet.

import { parseMetar, parseTAF } from "metar-taf-parser";

export interface RunwayVisualRange {
  runway: string;
  minM: number;
  maxM: number | null;
}

export interface CloudLayer {
  quantity: string;
  heightFt: number | null;
  type: string | null;
}

export interface ParsedMetar {
  station: string;
  observedAt: Date;
  raw: string;
  windDeg: number | null;
  windKt: number | null;
  gustKt: number | null;
  /** Prevailing visibility in metres; 9999 means 10 km or more. */
  visibilityM: number | null;
  rvr: RunwayVisualRange[];
  /** Present weather groups as written, for example "FG", "+RA", "FZRA", "BCFG". */
  weather: string[];
  clouds: CloudLayer[];
  /** Lowest BKN or OVC layer, or vertical visibility; null if none. */
  ceilingFt: number | null;
  cavok: boolean;
  temperatureC: number | null;
  dewPointC: number | null;
  qnhHpa: number | null;
  trends: string[];
}

const SM_TO_M = 1609.344;
const toMetres = (value: number, unit: string | undefined) => (unit === "SM" ? Math.round(value * SM_TO_M) : value);

interface WeatherConditionLike {
  intensity?: string;
  descriptive?: string;
  phenomenons?: string[];
}

export function weatherCode(w: WeatherConditionLike): string {
  const intensity = w.intensity === "+" || w.intensity === "-" || w.intensity === "VC" ? w.intensity : "";
  return `${intensity}${w.descriptive ?? ""}${(w.phenomenons ?? []).join("")}`;
}

/**
 * Parses one METAR. `observedAt` comes from the archive's timestamp, because the report itself
 * carries only day, hour and minute.
 */
export function parseMetarReport(raw: string, observedAt: Date): ParsedMetar {
  const m = parseMetar(raw.trim());
  const visibility = m.visibility as { value: number; unit?: string } | undefined;
  const clouds: CloudLayer[] = (m.clouds ?? []).map((c) => ({ quantity: String(c.quantity), heightFt: c.height ?? null, type: c.type ? String(c.type) : null }));
  const ceilingLayers = clouds.filter((c) => (c.quantity === "BKN" || c.quantity === "OVC") && c.heightFt !== null).map((c) => c.heightFt!);
  const vv = (m as { verticalVisibility?: number }).verticalVisibility;
  if (vv !== undefined) ceilingLayers.push(vv);
  const wind = m.wind as { degrees?: number; speed?: number; gust?: number; unit?: string } | undefined;
  const kt = (v: number | undefined) => (v === undefined ? null : wind?.unit === "MPS" ? Math.round(v * 1.943844) : v);
  return {
    station: m.station,
    observedAt,
    raw: raw.trim(),
    windDeg: wind?.degrees ?? null,
    windKt: kt(wind?.speed),
    gustKt: kt(wind?.gust),
    visibilityM: m.cavok ? 9999 : visibility ? toMetres(visibility.value, visibility.unit) : null,
    rvr: (m.runwaysInfo ?? []).map((r) => {
      const rr = r as { name: string; minRange?: number; maxRange?: number; unit?: string };
      const f = rr.unit === "FT" ? 0.3048 : 1;
      return { runway: rr.name, minM: Math.round((rr.minRange ?? 0) * f), maxM: rr.maxRange === undefined ? null : Math.round(rr.maxRange * f) };
    }),
    weather: (m.weatherConditions ?? []).map((w) => weatherCode(w as WeatherConditionLike)),
    clouds,
    ceilingFt: ceilingLayers.length ? Math.min(...ceilingLayers) : null,
    cavok: m.cavok === true,
    temperatureC: m.temperature ?? null,
    dewPointC: m.dewPoint ?? null,
    qnhHpa: m.altimeter ? (m.altimeter.unit === "inHg" ? Math.round(m.altimeter.value * 33.8639) : m.altimeter.value) : null,
    trends: (m.trends ?? []).map((t) => String((t as { raw?: string }).raw ?? t.type)),
  };
}

export interface TafPeriod {
  kind: string;
  from: string | null;
  to: string | null;
  visibilityM: number | null;
  weather: string[];
  ceilingFt: number | null;
  raw: string;
}

export interface ParsedTaf {
  station: string;
  issuedRaw: string;
  validFrom: string;
  validTo: string;
  periods: TafPeriod[];
  raw: string;
}

/** Parses a TAF; validity and change-group times stay as day/hour strings (DDHH). */
export function parseTafReport(raw: string): ParsedTaf {
  const t = parseTAF(raw.trim());
  const ddhh = (d?: number, h?: number) => (d === undefined || h === undefined ? null : `${String(d).padStart(2, "0")}${String(h).padStart(2, "0")}`);
  const period = (kind: string, p: Record<string, unknown>, from: string | null, to: string | null): TafPeriod => {
    const vis = p.visibility as { value: number; unit?: string } | undefined;
    const clouds = (p.clouds as { quantity: string; height?: number }[] | undefined) ?? [];
    const ceil = clouds.filter((c) => (c.quantity === "BKN" || c.quantity === "OVC") && c.height !== undefined).map((c) => c.height!);
    return {
      kind,
      from,
      to,
      visibilityM: p.cavok ? 9999 : vis ? toMetres(vis.value, vis.unit) : null,
      weather: ((p.weatherConditions as WeatherConditionLike[] | undefined) ?? []).map(weatherCode),
      ceilingFt: ceil.length ? Math.min(...ceil) : null,
      raw: String(p.raw ?? ""),
    };
  };
  const v = t.validity as { startDay?: number; startHour?: number; endDay?: number; endHour?: number };
  const base = period("BASE", t as unknown as Record<string, unknown>, ddhh(v.startDay, v.startHour), ddhh(v.endDay, v.endHour));
  const changes = (t.trends ?? []).map((tr) => {
    const tv = (tr as { validity?: { startDay?: number; startHour?: number; endDay?: number; endHour?: number } }).validity ?? {};
    const prob = (tr as { probability?: number }).probability;
    return period(`${prob ? `PROB${prob} ` : ""}${String(tr.type)}`, tr as unknown as Record<string, unknown>, ddhh(tv.startDay, tv.startHour), ddhh(tv.endDay, tv.endHour));
  });
  return { station: t.station, issuedRaw: raw.trim().split(/\s+/).slice(0, 3).join(" "), validFrom: base.from ?? "", validTo: base.to ?? "", periods: [base, ...changes], raw: raw.trim() };
}

/** Weather codes treated as significant in the indicator facts and the date search. */
export function significantWeather(codes: readonly string[]): string[] {
  return codes.filter((c) => /FG|TS|SN|FZ|GR|SQ|FC|\+RA|SS|DS|VA/.test(c));
}
