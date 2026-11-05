// A1 cause assessment (docs/SPEC.md 8.1): build the prompt, call the model, validate, retry
// once with the errors, map the recommendation in code, and fall back to a recorded fixture
// when live AI is unavailable. Never throws for AI problems.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadAirports } from "@/lib/demo/seed";
import type { Rule } from "@/lib/rules/schema";
import type { WeatherFact } from "@/lib/weather/facts";
import type { AiConfig } from "../config";
import type { StructuredCaller } from "../provider";
import type { SpendLog } from "../spend";
import { dataBlock } from "../text";
import { a1JsonSchema, a1OutputSchema, type A1Output, type Recommendation } from "./schema";
import { mapRecommendation, validateA1 } from "./validate";
import { displayTitle } from "@/lib/rules/display";

// v2 (2026-11-04): weather facts are cited by ID, never quoted; airports carry ICAO and IATA codes.
// v3 (2026-11-04): an unidentified likely cause has LOW confidence.
export const A1_PROMPT_VERSION = "A1.v3";

/** Rule IDs relevant to extraordinary circumstances; their entries go into the prompt. */
export const A1_RULE_IDS = [
  "REG-5-3", "REG-REC-14", "REG-REC-15", "CJEU-C-549-07", "CJEU-C-257-14", "CJEU-C-315-15",
  "CJEU-C-74-19", "CJEU-C-28-20", "CJEU-C-195-17", "CJEU-C-156-22", "CJEU-C-294-10",
];

export interface A1Input {
  /** Scenario key or eval case ID; selects the fixture fallback. */
  key: string;
  disruption: {
    flightNumber: string;
    origin: string;
    destination: string;
    type: "CANCELLATION" | "DELAY";
    schedDepUtc: string;
    schedArrUtc: string;
    informedAtUtc: string | null;
    previousFlight: { flightNumber: string; origin: string; destination: string; schedDepUtc: string; schedArrUtc: string } | null;
  };
  opsNote: string;
  maintenanceLog: string;
  otherEvidence: { name: string; text: string }[];
  facts: Pick<WeatherFact, "id" | "text">[];
  tafAvailable: boolean;
}

export interface A1Deps {
  config: AiConfig;
  caller: StructuredCaller | null;
  spend: SpendLog;
  rules: readonly Rule[];
  /** Recorded fixture for this input, if any. */
  fixture?: A1Fixture | null;
}

export const a1FixtureSchema = z.strictObject({
  key: z.string(),
  recordedAt: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  inputHash: z.string(),
  output: a1OutputSchema,
});
export type A1Fixture = z.infer<typeof a1FixtureSchema>;

/** Recorded live result for a scenario (written by npm run eval), or null if none. */
export function loadA1Fixture(key: string): A1Fixture | null {
  try {
    const file = path.join(process.cwd(), "fixtures", "ai", `A1-${key}.json`);
    return a1FixtureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export interface A1Result {
  model: string;
  promptVersion: string;
  inputHash: string;
  /** Validated output, or null when nothing valid was obtained. */
  output: A1Output | null;
  /** Raw model output of the last failed attempt, kept for debugging. */
  rawFailedOutput: unknown;
  validation: { ok: boolean; errors: string[]; attempts: number; emojiStripped: boolean };
  shownRecommendation: Recommendation;
  modelRecommendation: Recommendation | null;
  disagreement: boolean;
  retries: number;
  usedFixture: boolean;
  /** Label for the UI, e.g. "Cached AI result recorded ...; live AI unavailable". */
  notice: string | null;
  costUsd: number;
  latencyMs: number;
}

function loadPrompt(): string {
  return readFileSync(path.join(process.cwd(), "prompts", `${A1_PROMPT_VERSION}.md`), "utf8");
}

let airportNames: Map<string, string> | null = null;
/** "LPPT (LIS, Lisbon)" for airports in data/airports.json, otherwise the code as given. */
function airportLabel(icao: string): string {
  airportNames ??= new Map(loadAirports().map((a) => [a.icao, `${a.icao} (${a.iata}, ${a.city})`]));
  return airportNames.get(icao) ?? icao;
}

export function buildA1UserMessage(input: A1Input, rules: readonly Rule[]): string {
  const raw = input.disruption;
  const prev = raw.previousFlight;
  const d = {
    ...raw,
    origin: airportLabel(raw.origin),
    destination: airportLabel(raw.destination),
    previousFlight: prev ? { ...prev, origin: airportLabel(prev.origin), destination: airportLabel(prev.destination) } : null,
  };
  const ruleLines = rules
    .filter((r) => A1_RULE_IDS.includes(r.id) && r.status === "VERIFIED")
    .map((r) => `${r.id} | ${displayTitle(r)} | ${r.excerpt}`)
    .join("\n");
  const factLines = input.facts.map((f) => `${f.id} | ${f.text}`).join("\n") || "(no weather facts)";
  return [
    "DISRUPTION",
    `Flight ${d.flightNumber} ${d.origin} to ${d.destination}, ${d.type.toLowerCase()}.`,
    `Scheduled departure ${d.schedDepUtc}, scheduled arrival ${d.schedArrUtc} (UTC).`,
    d.informedAtUtc ? `Passengers informed at ${d.informedAtUtc} (UTC).` : "Time passengers were informed: not recorded.",
    d.previousFlight
      ? `Previous flight of the same aircraft: ${d.previousFlight.flightNumber} ${d.previousFlight.origin} to ${d.previousFlight.destination}, scheduled ${d.previousFlight.schedDepUtc} to ${d.previousFlight.schedArrUtc} (UTC).`
      : "Previous flight of the same aircraft: not recorded.",
    input.tafAvailable ? "" : "Forecasts (TAF) are not available for this date; weather facts come from observations (METAR) only.",
    "",
    dataBlock("ops_note", input.opsNote),
    "",
    dataBlock("maintenance_log", input.maintenanceLog || "(none)"),
    ...input.otherEvidence.flatMap((e) => ["", dataBlock(e.name, e.text)]),
    "",
    "FACTS (weather facts computed by code from archived reports; cite by ID)",
    dataBlock("facts", factLines),
    "",
    "RULES (the only IDs you may cite)",
    dataBlock("rules", ruleLines),
  ].join("\n");
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function assessCause(input: A1Input, deps: A1Deps): Promise<A1Result> {
  const { config, spend, rules } = deps;
  const model = config.models.A1 ?? "unset";
  const system = loadPrompt();
  const user = buildA1UserMessage(input, rules);
  const inputHash = sha(`${A1_PROMPT_VERSION}\n${model}\n${user}`);
  const citable = new Set(rules.filter((r) => r.status === "VERIFIED" && (r.kind === "LAW" || r.kind === "CASE_LAW")).map((r) => r.id));
  const ctx = { opsNote: input.opsNote, maintenanceLog: input.maintenanceLog, otherEvidence: input.otherEvidence.map((e) => e.text), factIds: new Set(input.facts.map((f) => f.id)), citable };

  const fallback = (reason: string, costUsd = 0, latencyMs = 0, retries = 0, rawFailedOutput: unknown = null): A1Result => {
    const fx = deps.fixture;
    if (fx) {
      const shown = mapRecommendation(fx.output);
      return {
        model: fx.model, promptVersion: fx.promptVersion, inputHash: fx.inputHash, output: fx.output, rawFailedOutput,
        validation: { ok: true, errors: [], attempts: 0, emojiStripped: false },
        shownRecommendation: shown, modelRecommendation: fx.output.modelRecommendation, disagreement: shown !== fx.output.modelRecommendation,
        retries, usedFixture: true, notice: `Cached AI result recorded ${fx.recordedAt.slice(0, 10)}; live AI unavailable (${reason})`, costUsd, latencyMs,
      };
    }
    return {
      model, promptVersion: A1_PROMPT_VERSION, inputHash, output: null, rawFailedOutput,
      validation: { ok: false, errors: [reason], attempts: retries + (rawFailedOutput ? 1 : 0), emojiStripped: false },
      shownRecommendation: "UNCERTAIN_HUMAN_MUST_DECIDE", modelRecommendation: null, disagreement: false,
      retries, usedFixture: false, notice: `AI assessment unavailable (${reason}). A duty manager decides from the evidence.`, costUsd, latencyMs,
    };
  };

  if (config.mode === "fixtures") return fallback("AI_MODE is fixtures");
  if (!deps.caller || !config.apiKey) return fallback("no OpenAI API key configured");
  if (!config.models.A1) return fallback("OPENAI_MODEL_ASSESS is not set");
  if ((await spend.todayUsd()) >= config.dailyBudgetUsd) return fallback("AI budget reached; showing cached results");

  let costUsd = 0;
  let latencyMs = 0;
  let errors: string[] = [];
  let lastRaw: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote = attempt === 0 ? "" : `\n\nYour previous output failed validation. Fix these problems and answer again:\n${errors.map((e) => `- ${e}`).join("\n")}`;
    const res = await deps.caller({ model, system, user: user + retryNote, schemaName: "a1_cause_assessment", jsonSchema: a1JsonSchema });
    costUsd += res.costUsd;
    latencyMs += res.latencyMs;
    await spend.record({ component: "A1", model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: res.costUsd, ok: res.ok, usedFixture: false, latencyMs: res.latencyMs });
    if (!res.ok) {
      // API failures (network, 5xx, timeout) go straight to the fallback; one call is enough.
      return fallback(res.error, costUsd, latencyMs, attempt);
    }
    lastRaw = res.json;
    const v = validateA1(res.json, ctx);
    if (v.ok && v.output) {
      const shown = mapRecommendation(v.output);
      return {
        model, promptVersion: A1_PROMPT_VERSION, inputHash, output: v.output, rawFailedOutput: null,
        validation: { ok: true, errors: attempt ? errors : [], attempts: attempt + 1, emojiStripped: v.emojiStripped },
        shownRecommendation: shown, modelRecommendation: v.output.modelRecommendation, disagreement: shown !== v.output.modelRecommendation,
        retries: attempt, usedFixture: false, notice: null, costUsd, latencyMs,
      };
    }
    errors = v.errors;
  }
  // Two failed validations: never show the output as if valid.
  return {
    model, promptVersion: A1_PROMPT_VERSION, inputHash, output: null, rawFailedOutput: lastRaw,
    validation: { ok: false, errors, attempts: 2, emojiStripped: false },
    shownRecommendation: "UNCERTAIN_HUMAN_MUST_DECIDE", modelRecommendation: null, disagreement: false,
    retries: 1, usedFixture: false, notice: "AI output failed validation. A duty manager decides from the evidence.", costUsd, latencyMs,
  };
}
