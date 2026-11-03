// AI configuration from env vars (golden rule 11: model IDs are never hardcoded).

export type AiMode = "live" | "fixtures";
export type AiComponent = "A1" | "A2" | "A3" | "A4";

export interface AiConfig {
  apiKey: string | null;
  mode: AiMode;
  dailyBudgetUsd: number;
  models: Record<AiComponent, string | null>;
}

type Env = Record<string, string | undefined>;

export function aiConfig(env: Env = process.env): AiConfig {
  const budget = Number(env.AI_DAILY_BUDGET_USD ?? "3");
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    mode: env.AI_MODE === "fixtures" ? "fixtures" : "live",
    dailyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : 3,
    models: {
      A1: env.OPENAI_MODEL_ASSESS?.trim() || null,
      A2: env.OPENAI_MODEL_VISION?.trim() || null,
      A3: env.OPENAI_MODEL_TEXT?.trim() || null,
      A4: env.OPENAI_MODEL_TEXT?.trim() || null,
    },
  };
}
