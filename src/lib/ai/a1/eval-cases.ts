// Loads A1 eval cases (data/evals/a1-cases.json) and turns each into an A1Input. Synthetic
// weather reports go through the same parser and fact builder as the real fixtures.

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { buildFacts, parseFixture, tafFacts, type WeatherFact } from "@/lib/weather/facts";
import { parseTafReport } from "@/lib/weather/parse";
import { weatherWindows } from "@/lib/weather/windows";
import type { A1Input } from "./assess";
import { RECOMMENDATIONS } from "./schema";
import { scenarioA1Input } from "./scenario-input";

const metarSource = z.union([
  z.strictObject({ lines: z.array(z.string()) }),
  z.strictObject({ pattern: z.string(), from: z.string(), to: z.string() }),
]);

const caseSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  expected: z.enum(RECOMMENDATIONS),
  note: z.string().optional(),
  scenario: z.enum(["A", "B"]).optional(),
  flight: z
    .strictObject({
      number: z.string(), origin: z.string(), destination: z.string(), type: z.enum(["CANCELLATION", "DELAY"]),
      schedDepUtc: z.string(), schedArrUtc: z.string(), informedAtUtc: z.string().nullable(),
      previous: z.strictObject({ flightNumber: z.string(), origin: z.string(), destination: z.string(), schedDepUtc: z.string(), schedArrUtc: z.string() }).optional(),
    })
    .optional(),
  opsNote: z.string().optional(),
  maintenanceLog: z.string().optional(),
  otherEvidence: z.array(z.strictObject({ name: z.string(), text: z.string() })).optional(),
  metars: z.record(z.string(), metarSource).optional(),
  tafs: z.record(z.string(), z.array(z.strictObject({ issuedUtc: z.string(), raw: z.string() }))).optional(),
});
export type A1EvalCase = z.infer<typeof caseSchema>;

export function loadA1Cases(): A1EvalCase[] {
  const file = JSON.parse(readFileSync(path.join(process.cwd(), "data", "evals", "a1-cases.json"), "utf8"));
  return z.strictObject({ note: z.string(), cases: z.array(caseSchema) }).parse(file).cases;
}

/** Expands a half-hourly pattern; {DDHHMM} becomes the METAR time group. */
function expand(icao: string, src: z.infer<typeof metarSource>): string {
  if ("lines" in src) return src.lines.join("\n");
  const out: string[] = [];
  for (let t = new Date(src.from).getTime(); t <= new Date(src.to).getTime(); t += 30 * 60_000) {
    const d = new Date(t);
    const group = `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
    out.push(`${d.toISOString().slice(0, 16)}Z ${icao} ${src.pattern.replace("{DDHHMM}", group)}`);
  }
  return out.join("\n");
}

export function caseInput(c: A1EvalCase): A1Input {
  if (c.scenario) return { ...scenarioA1Input(c.scenario), key: c.id };
  const f = c.flight!;
  const windows = weatherWindows({
    origin: f.origin, destination: f.destination, schedDep: new Date(f.schedDepUtc), schedArr: new Date(f.schedArrUtc),
    cancelledAt: f.informedAtUtc ? new Date(f.informedAtUtc) : null,
    previous: f.previous ? { origin: f.previous.origin, destination: f.previous.destination, schedDep: new Date(f.previous.schedDepUtc), schedArr: new Date(f.previous.schedArrUtc) } : null,
  });
  const reports = new Map(Object.entries(c.metars ?? {}).map(([icao, src]) => [icao, { evidenceId: `EV-${c.id}-${icao}-METAR`, obs: parseFixture(expand(icao, src)) }]));
  const facts: WeatherFact[] = buildFacts(windows, reports);
  for (const [icao, list] of Object.entries(c.tafs ?? {})) {
    for (const t of list) facts.push(...tafFacts(parseTafReport(t.raw), `EV-${c.id}-${icao}-TAF`, new Date(t.issuedUtc)));
  }
  return {
    key: c.id,
    disruption: {
      flightNumber: f.number, origin: f.origin, destination: f.destination, type: f.type,
      schedDepUtc: f.schedDepUtc, schedArrUtc: f.schedArrUtc, informedAtUtc: f.informedAtUtc, previousFlight: f.previous ?? null,
    },
    opsNote: c.opsNote ?? "",
    maintenanceLog: c.maintenanceLog ?? "",
    otherEvidence: c.otherEvidence ?? [],
    facts: facts.map((x) => ({ id: x.id, text: x.text })),
    tafAvailable: Object.keys(c.tafs ?? {}).length > 0,
  };
}
