// A3 notice writer (SPEC 8.3): one passenger notice per disruption and outcome, with
// placeholders only; code fills every name, amount and link. Validated before use; on failure
// (or with live AI off) the caller uses its code template instead.

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AiConfig } from "../config";
import type { StructuredCaller } from "../provider";
import type { SpendLog } from "../spend";
import { containsMoney, dataBlock, stripEmoji, wordCount } from "../text";

export const A3_PROMPT_VERSION = "A3.v1";
export const NOTICE_OUTCOMES = ["COMPENSATION_APPROVED", "COMPENSATION_DENIED_WITH_CARE", "CARE_ONLY"] as const;
export type NoticeOutcome = (typeof NOTICE_OUTCOMES)[number];

export const PLACEHOLDERS = ["PASSENGER_NAME", "COMPENSATION_AMOUNT", "MEAL_ALLOWANCE", "CLAIM_LINK", "DECISION_REASON"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const OUTCOME_PLACEHOLDERS: Record<NoticeOutcome, { required: Placeholder[]; allowed: Placeholder[] }> = {
  COMPENSATION_APPROVED: { required: ["PASSENGER_NAME", "COMPENSATION_AMOUNT", "CLAIM_LINK"], allowed: ["MEAL_ALLOWANCE"] },
  COMPENSATION_DENIED_WITH_CARE: { required: ["PASSENGER_NAME", "DECISION_REASON", "CLAIM_LINK"], allowed: ["MEAL_ALLOWANCE"] },
  CARE_ONLY: { required: ["PASSENGER_NAME", "CLAIM_LINK"], allowed: ["MEAL_ALLOWANCE"] },
};

const OUTCOME_TASK: Record<NoticeOutcome, string> = {
  COMPENSATION_APPROVED: "Compensation has been approved by the duty manager. The passenger also has care (meals; hotel and transport where needed) and, for a cancellation, a choice between a refund and the new flight.",
  COMPENSATION_DENIED_WITH_CARE: "A duty manager signed a decision that no compensation is owed because of extraordinary circumstances. Care (meals; hotel and transport where needed) is still provided, and for a cancellation the passenger still chooses between a refund and the new flight.",
  CARE_ONLY: "No compensation is owed for this disruption (for example a delay below the compensation threshold), but care (meals; hotel and transport where needed) is provided.",
};

const a3Schema = z.object({ text: z.string().min(40).max(2500), citations: z.array(z.string()).max(6) });
export const a3JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "citations"],
  properties: { text: { type: "string" }, citations: { type: "array", items: { type: "string" } } },
} as const;

export interface A3Input {
  outcome: NoticeOutcome;
  flight: { number: string; origin: string; destination: string; type: "CANCELLATION" | "DELAY" };
  rules: { id: string; title: string; summary: string }[];
}

export function validateA3(json: unknown, ctx: { outcome: NoticeOutcome; citable: ReadonlySet<string> }): { ok: true; text: string; citations: string[] } | { ok: false; errors: string[] } {
  const parsed = a3Schema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "output"}: ${i.message}`) };
  const text = stripEmoji(parsed.data.text).trim();
  const errors: string[] = [];
  const used = new Set([...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]));
  const spec = OUTCOME_PLACEHOLDERS[ctx.outcome];
  for (const p of spec.required) if (!used.has(p)) errors.push(`missing placeholder {{${p}}}`);
  for (const p of used) if (!spec.required.includes(p as Placeholder) && !spec.allowed.includes(p as Placeholder)) errors.push(`placeholder {{${p}}} is not allowed for this outcome`);
  if (containsMoney(text.replace(/\{\{[A-Z_]+\}\}/g, ""))) errors.push("the text contains an amount of money; use placeholders");
  for (const c of parsed.data.citations) if (!ctx.citable.has(c)) errors.push(`citation ${c} is not in the rules list`);
  if (wordCount(text) > 180) errors.push("the notice is longer than 160 words");
  const sentences = text.split(/[.!?]\s/).filter((s) => s.trim());
  if (sentences.some((s) => wordCount(s) > 30)) errors.push("a sentence is longer than 30 words");
  if (ctx.outcome === "COMPENSATION_DENIED_WITH_CARE" && !/enforcement body/i.test(text)) errors.push("a denial notice must say the passenger may contest it with the national enforcement body");
  if (errors.length) return { ok: false, errors };
  return { ok: true, text, citations: [...new Set(parsed.data.citations)] };
}

export interface A3Result { text: string; citations: string[]; model: string; retries: number; errors: string[]; costUsd: number }

/** Null when live AI is unavailable or the output failed twice; the caller then uses its template. */
export async function writeNotice(input: A3Input, deps: { config: AiConfig; caller: StructuredCaller | null; spend: SpendLog }): Promise<A3Result | null> {
  const model = deps.config.models.A3;
  if (deps.config.mode === "fixtures" || !deps.caller || !deps.config.apiKey || !model) return null;
  if ((await deps.spend.todayUsd()) >= deps.config.dailyBudgetUsd) return null;
  const spec = OUTCOME_PLACEHOLDERS[input.outcome];
  const user = [
    `OUTCOME: ${input.outcome}`,
    OUTCOME_TASK[input.outcome],
    `Required placeholders: ${spec.required.map((p) => `{{${p}}}`).join(", ")}. Allowed as well: ${spec.allowed.map((p) => `{{${p}}}`).join(", ") || "none"}.`,
    "",
    dataBlock("flight", `${input.flight.number} from ${input.flight.origin} to ${input.flight.destination}, ${input.flight.type === "CANCELLATION" ? "cancelled" : "delayed"}. Demo Air (fictional carrier).`),
    "",
    "RULES (the only IDs you may cite)",
    dataBlock("rules", input.rules.map((r) => `${r.id} | ${r.title} | ${r.summary}`).join("\n")),
  ].join("\n");
  const citable = new Set(input.rules.map((r) => r.id));
  const system = readFileSync(path.join(process.cwd(), "prompts", `${A3_PROMPT_VERSION}.md`), "utf8");
  let errors: string[] = [];
  let costUsd = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote = attempt === 0 ? "" : `\n\nYour previous notice failed these checks; write it again without the problems:\n${errors.map((e) => `- ${e}`).join("\n")}`;
    const res = await deps.caller({ model, system, user: user + retryNote, schemaName: "a3_notice", jsonSchema: a3JsonSchema, timeoutMs: 30_000 });
    costUsd += res.costUsd;
    await deps.spend.record({ component: "A3", model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: res.costUsd, ok: res.ok, usedFixture: false, latencyMs: res.latencyMs });
    if (!res.ok) return null;
    const v = validateA3(res.json, { outcome: input.outcome, citable });
    if (v.ok) return { text: v.text, citations: v.citations, model, retries: attempt, errors: [], costUsd };
    errors = v.errors;
  }
  return null;
}

/** Code fills the placeholders; anything unknown is removed rather than shown. */
export function fillNotice(text: string, values: Partial<Record<Placeholder, string>>): string {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => values[key as Placeholder] ?? "");
}
