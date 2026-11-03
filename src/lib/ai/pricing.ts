// Prices per million tokens, looked up on developers.openai.com/pricing on 2026-11-03
// (docs/PROGRESS.md). This is data for spend estimates, not a model choice.

export const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6.1-terra": { input: 1, output: 5 },
  "gpt-6.1-sol": { input: 2, output: 10 },
  "gpt-6-astra": { input: 10, output: 50 },
};

/** Unknown models are priced at the most expensive known rate so the budget cap stays safe. */
const FALLBACK = { input: 10, output: 50 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES_USD_PER_MTOK[model] ?? FALLBACK;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
