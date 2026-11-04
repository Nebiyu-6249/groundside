// One structured-output call to OpenAI (Responses API, JSON schema, strict). Never throws:
// every failure comes back as { ok: false } so callers can fall back to fixtures.

import OpenAI from "openai";
import { estimateCostUsd } from "./pricing";

export interface StructuredRequest {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  timeoutMs?: number;
  /** Images sent with the user message (vision input), as data URLs. */
  images?: string[];
}

export type StructuredResult =
  | { ok: true; json: unknown; rawText: string; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number }
  | { ok: false; error: string; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number };

export type StructuredCaller = (req: StructuredRequest) => Promise<StructuredResult>;

export function openAiCaller(apiKey: string): StructuredCaller {
  // SDK retries are off: the component decides whether to retry (one retry, SPEC 8).
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  return async (req) => {
    const started = Date.now();
    try {
      const res = await client.responses.create(
        {
          model: req.model,
          input: [
            { role: "system", content: req.system },
            req.images?.length
              ? { role: "user", content: [{ type: "input_text", text: req.user }, ...req.images.map((url) => ({ type: "input_image" as const, image_url: url, detail: "high" as const }))] }
              : { role: "user", content: req.user },
          ],
          text: { format: { type: "json_schema", name: req.schemaName, schema: req.jsonSchema, strict: true } },
        },
        { timeout: req.timeoutMs ?? 60_000 },
      );
      const inputTokens = res.usage?.input_tokens ?? 0;
      const outputTokens = res.usage?.output_tokens ?? 0;
      const costUsd = estimateCostUsd(req.model, inputTokens, outputTokens);
      const latencyMs = Date.now() - started;
      const rawText = res.output_text ?? "";
      try {
        return { ok: true, json: JSON.parse(rawText), rawText, inputTokens, outputTokens, costUsd, latencyMs };
      } catch {
        return { ok: false, error: "Model output was not valid JSON", inputTokens, outputTokens, costUsd, latencyMs };
      }
    } catch (err) {
      // The SDK error message never contains the API key; keep only status and message.
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : "unknown error";
      return { ok: false, error: `OpenAI request failed${status ? ` (HTTP ${status})` : ""}: ${message.slice(0, 200)}`, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: Date.now() - started };
    }
  };
}
