// npm run weather:fetch -- --scenario=A [--force]
// Downloads the archived METARs for a scenario's windows from the Iowa Environmental Mesonet
// and saves them as fixtures: data/weather/<scenario>/<ICAO>-METAR.txt plus a JSON sidecar.
// Fixtures are never edited; an existing fixture is only replaced with --force.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadScenario, resolveTimes, type ScenarioKey } from "../src/lib/demo/scenarios";
import { loadAirports } from "../src/lib/demo/seed";
import { fetchRanges, weatherWindows } from "../src/lib/weather/windows";

const IEM = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 16) + "Z";

async function main() {
  const key = (process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1] ?? "A") as ScenarioKey;
  const force = process.argv.includes("--force");
  const scenario = loadScenario(key);
  if (scenario.dateIsPlaceholder) throw new Error(`Scenario ${key} still has a placeholder date`);
  const t = resolveTimes(scenario, new Map(loadAirports().map((a) => [a.icao, a])));
  const windows = weatherWindows({
    origin: scenario.flight.origin,
    destination: scenario.flight.destination,
    schedDep: t.schedDep,
    schedArr: t.schedArr,
    cancelledAt: scenario.type === "CANCELLATION" ? t.informedAt : null,
    previous: { origin: scenario.previousFlight.origin, destination: scenario.previousFlight.destination, schedDep: t.prevDep, schedArr: t.prevArr },
  });
  const dir = path.join(process.cwd(), "data", "weather", key);
  mkdirSync(dir, { recursive: true });

  for (const range of fetchRanges(windows)) {
    const file = path.join(dir, `${range.icao}-METAR.txt`);
    if (existsSync(file) && !force) {
      console.log(`${range.icao}: fixture exists, skipped (use --force to replace)`);
      continue;
    }
    const params = new URLSearchParams({ station: range.icao, data: "metar", tz: "UTC", format: "onlycomma", sts: iso(range.from), ets: iso(range.to) });
    const url = `${IEM}?${params}`;
    const res = await fetch(url, { headers: { "User-Agent": "groundside-hackathon (github.com/Nebiyu-6249/groundside)" } });
    if (!res.ok) throw new Error(`${range.icao}: IEM returned HTTP ${res.status}`);
    // Rows are "station,valid,metar" after a header line; keep the timestamp and the report.
    const reports = (await res.text()).split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
      const [, valid, ...rest] = line.split(",");
      return `${valid.replace(" ", "T")}Z ${rest.join(",")}`;
    });
    const body = reports.join("\n") + "\n";
    writeFileSync(file, body);
    const sidecar = {
      source: "Iowa Environmental Mesonet (IEM), Iowa State University, ASOS/METAR archive",
      sourceUrl: url,
      termsUrl: "https://mesonet.agron.iastate.edu/disclaimer.php",
      query: Object.fromEntries(params),
      retrievedAt: new Date().toISOString(),
      sha256: createHash("sha256").update(body).digest("hex"),
      format: "One report per line: archive timestamp (UTC, ISO) followed by the raw METAR.",
      windows: windows.filter((w) => w.icao === range.icao).map((w) => ({ role: w.role, from: w.from.toISOString(), to: w.to.toISOString() })),
      reports: reports.length,
    };
    writeFileSync(file.replace(/\.txt$/, ".json"), JSON.stringify(sidecar, null, 2) + "\n");
    console.log(`${range.icao}: ${reports.length} reports saved (${range.roles.join(", ")})`);
    await sleep(5000); // IEM throttles per IP (1 request per second, stricter after bursts).
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
