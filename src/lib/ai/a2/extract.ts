// A2 receipt reading (SPEC 8.2): one vision call with strict structured output, Zod validation,
// one retry, spend logging and the daily budget. When live AI is unavailable, a reading recorded
// for the same image (by SHA-256, from npm run eval:a2) is used and labelled; otherwise the
// receipt goes to a human.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AiConfig } from "../config";
import type { StructuredCaller } from "../provider";
import type { SpendLog } from "../spend";
import { mapStrings, stripEmoji } from "../text";
import { a2JsonSchema, a2OutputSchema, type A2Output } from "./schema";

export const A2_PROMPT_VERSION = "A2.v2";

export interface A2Deps {
  config: AiConfig;
  caller: StructuredCaller | null;
  spend: SpendLog;
}

export interface A2Result {
  output: A2Output | null;
  model: string;
  promptVersion: string;
  retries: number;
  usedFixture: boolean;
  notice: string | null;
  errors: string[];
  costUsd: number;
}

function loadPrompt(): string {
  return readFileSync(path.join(process.cwd(), "prompts", `${A2_PROMPT_VERSION}.md`), "utf8");
}

export function a2FixturePath(sha256: string): string {
  return path.join(process.cwd(), "fixtures", "ai", "a2", `${sha256}.json`);
}

function loadFixture(sha256: string): { output: A2Output; model: string; recordedAt: string } | null {
  const file = a2FixturePath(sha256);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as { output: unknown; model: string; recordedAt: string };
  const parsed = a2OutputSchema.safeParse(raw.output);
  return parsed.success ? { output: parsed.data, model: raw.model, recordedAt: raw.recordedAt } : null;
}

export function validateA2(json: unknown): { ok: true; output: A2Output } | { ok: false; errors: string[] } {
  const parsed = a2OutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "output"}: ${i.message}`) };
  return { ok: true, output: mapStrings(parsed.data, stripEmoji) };
}

export async function readReceipt(image: { jpeg: Buffer; sha256: string; scenarioContext: string }, deps: A2Deps): Promise<A2Result> {
  const model = deps.config.models.A2 ?? "unset";
  const fallback = (reason: string, costUsd = 0, retries = 0, errors: string[] = []): A2Result => {
    const fx = loadFixture(image.sha256);
    if (fx) return { output: fx.output, model: fx.model, promptVersion: A2_PROMPT_VERSION, retries, usedFixture: true, notice: `Cached AI reading recorded ${fx.recordedAt.slice(0, 10)}; live AI unavailable (${reason})`, errors, costUsd };
    return { output: null, model, promptVersion: A2_PROMPT_VERSION, retries, usedFixture: false, notice: `AI reading unavailable (${reason}). A person will read this receipt.`, errors: errors.length ? errors : [reason], costUsd };
  };

  if (deps.config.mode === "fixtures") return fallback("AI_MODE is fixtures");
  if (!deps.caller || !deps.config.apiKey) return fallback("no OpenAI API key configured");
  if (!deps.config.models.A2) return fallback("OPENAI_MODEL_VISION is not set");
  if ((await deps.spend.todayUsd()) >= deps.config.dailyBudgetUsd) return fallback("AI budget reached; showing cached results");

  const system = loadPrompt();
  const dataUrl = `data:image/jpeg;base64,${image.jpeg.toString("base64")}`;
  let errors: string[] = [];
  let costUsd = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote = attempt === 0 ? "" : `\n\nYour previous output failed validation. Fix these problems:\n${errors.map((e) => `- ${e}`).join("\n")}`;
    const res = await deps.caller({ model, system, user: `Read this receipt. ${image.scenarioContext}${retryNote}`, schemaName: "a2_receipt_reading", jsonSchema: a2JsonSchema, images: [dataUrl] });
    costUsd += res.costUsd;
    await deps.spend.record({ component: "A2", model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: res.costUsd, ok: res.ok, usedFixture: false, latencyMs: res.latencyMs });
    if (!res.ok) return fallback(res.error, costUsd, attempt);
    const v = validateA2(res.json);
    if (v.ok) return { output: v.output, model, promptVersion: A2_PROMPT_VERSION, retries: attempt, usedFixture: false, notice: null, errors: [], costUsd };
    errors = v.errors;
  }
  return fallback("the reading failed validation twice", costUsd, 1, errors);
}
