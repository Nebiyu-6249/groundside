// npm run weather:dates -- <IEM METAR CSV with columns station,valid,metar>
// Ranks candidate dates for scenarios A and B against the criteria in docs/DEMO.md 2.1,
// using the scenario windows of docs/SPEC.md 7.3. Prints a summary per date.

import { readFileSync } from "node:fs";
import { loadScenario, resolveTimes, type Scenario } from "../src/lib/demo/scenarios";
import { loadAirports } from "../src/lib/demo/seed";
import { parseMetarReport, significantWeather, type ParsedMetar } from "../src/lib/weather/parse";

const H = 3_600_000;

function loadCsv(file: string): ParsedMetar[] {
  const out: ParsedMetar[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    const [station, valid, ...rest] = line.split(",");
    const raw = rest.join(",");
    if (!station || !raw) continue;
    try {
      out.push(parseMetarReport(raw, new Date(`${valid.replace(" ", "T")}:00Z`)));
    } catch {
      // Unparseable archive line: skipped in the search, never in fixtures.
    }
  }
  return out;
}

const within = (m: ParsedMetar[], icao: string, from: Date, to: Date) =>
  m.filter((x) => x.station === icao && x.observedAt >= from && x.observedAt <= to);

function clearSummary(obs: ParsedMetar[]) {
  const bad = obs.filter((o) => significantWeather(o.weather).length > 0 || (o.visibilityM ?? 0) < 9999 || (o.ceilingFt !== null && o.ceilingFt < 3000));
  return { count: obs.length, bad: bad.length, minVis: Math.min(...obs.map((o) => o.visibilityM ?? 0)), minCeil: Math.min(...obs.map((o) => o.ceilingFt ?? 99999)) };
}

/** Scenario times shifted to another local date. */
function timesOn(s: Scenario, date: string) {
  return resolveTimes({ ...s, dateLocal: date }, new Map(loadAirports().map((a) => [a.icao, a])));
}

function dates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pass the IEM CSV path");
  const metars = loadCsv(file);
  const first = metars.reduce((a, b) => (a.observedAt < b.observedAt ? a : b)).observedAt.toISOString().slice(0, 10);
  const last = metars.reduce((a, b) => (a.observedAt > b.observedAt ? a : b)).observedAt.toISOString().slice(0, 10);

  const a = loadScenario("A");
  console.log("Scenario A: clear at EDDF (departure), OMDB (arrival), LEMD (previous departure)");
  for (const date of dates(first, last)) {
    const t = timesOn(a, date);
    const windows = [
      clearSummary(within(metars, "EDDF", new Date(t.schedDep.getTime() - 3 * H), new Date(t.schedDep.getTime() + 2 * H))),
      clearSummary(within(metars, "OMDB", new Date(t.schedArr.getTime() - 2 * H), new Date(t.schedArr.getTime() + 2 * H))),
      clearSummary(within(metars, "LEMD", new Date(t.prevDep.getTime() - 2 * H), new Date(t.prevDep.getTime() + 2 * H))),
      clearSummary(within(metars, "EDDF", new Date(t.prevArr.getTime() - 2 * H), new Date(t.prevArr.getTime() + 2 * H))),
    ];
    if (windows.every((w) => w.count >= 4 && w.bad === 0)) {
      console.log(`  ${date} (${new Date(`${date}T12:00:00Z`).toUTCString().slice(0, 3)}) reports ${windows.map((w) => w.count).join("/")}, min ceiling ${Math.min(...windows.map((w) => w.minCeil))} ft`);
    }
  }

  const b = loadScenario("B");
  console.log("\nScenario B: fog at LIMC (vis <= 200 m or RVR < 550 m for 3+ h spanning departure), LPPT normal");
  for (const date of dates(first, last)) {
    const t = timesOn(b, date);
    const limc = within(metars, "LIMC", new Date(t.schedDep.getTime() - 3 * H), new Date(t.schedDep.getTime() + 2 * H));
    const foggy = (o: ParsedMetar) => o.weather.some((w) => w.includes("FG") && !w.startsWith("BC") && !w.startsWith("MI")) && ((o.visibilityM ?? 9999) <= 200 || o.rvr.some((r) => r.minM < 550));
    // Longest run of consecutive foggy reports, and whether it spans the scheduled departure.
    let best = { start: null as Date | null, end: null as Date | null };
    let run: ParsedMetar[] = [];
    for (const o of limc) {
      if (foggy(o)) run.push(o);
      else run = [];
      if (run.length && (!best.start || run[run.length - 1].observedAt.getTime() - run[0].observedAt.getTime() > best.end!.getTime() - best.start.getTime())) best = { start: run[0].observedAt, end: run[run.length - 1].observedAt };
    }
    const spans = best.start && best.end && best.start <= t.schedDep && best.end >= t.schedDep && best.end.getTime() - best.start.getTime() >= 3 * H;
    const lppt = clearSummary(within(metars, "LPPT", new Date(t.schedArr.getTime() - 2 * H), new Date(t.schedArr.getTime() + 2 * H)));
    const lpptOk = lppt.count >= 4 && within(metars, "LPPT", new Date(t.schedArr.getTime() - 2 * H), new Date(t.schedArr.getTime() + 2 * H)).every((o) => significantWeather(o.weather).length === 0 && (o.visibilityM ?? 0) >= 5000);
    if (spans && lpptOk) {
      const minVis = Math.min(...limc.map((o) => o.visibilityM ?? 9999));
      const minRvr = Math.min(...limc.flatMap((o) => o.rvr.map((r) => r.minM)), 9999);
      console.log(`  ${date} (${new Date(`${date}T12:00:00Z`).toUTCString().slice(0, 3)}) fog ${best.start!.toISOString().slice(11, 16)}Z to ${best.end!.toISOString().slice(11, 16)}Z, min vis ${minVis} m, min RVR ${minRvr} m; LPPT min vis ${lppt.minVis} m`);
    }
  }
}

main();
