import { describe, expect, it, vi } from "vitest";
import { readReceipt } from "@/lib/ai/a2/extract";
import { A4_FALLBACK, answerQuestion } from "@/lib/ai/a4/answer";
import type { AiConfig } from "@/lib/ai/config";
import { memorySpendLog } from "@/lib/ai/spend";

const config: AiConfig = { apiKey: "test-key", mode: "live", dailyBudgetUsd: 3, models: { A1: "m", A2: "m", A3: "m", A4: "m" } };

describe("AI daily budget cap (SPEC 8.5)", () => {
  it("A2 falls back without calling the model once the budget is spent", async () => {
    const caller = vi.fn();
    const r = await readReceipt({ jpeg: Buffer.from("x"), sha256: "0".repeat(64), scenarioContext: "" }, { config, caller, spend: memorySpendLog(3) });
    expect(caller).not.toHaveBeenCalled();
    expect(r.output).toBeNull();
    expect(r.notice).toContain("AI budget reached");
  });

  it("A4 falls back to a safe answer that offers a person", async () => {
    const caller = vi.fn();
    const r = await answerQuestion("How much do I get?", { text: "case", amountsCents: [] }, [], { config, caller, spend: memorySpendLog(3.5) });
    expect(caller).not.toHaveBeenCalled();
    expect(r.output.answer).toBe(A4_FALLBACK);
    expect(r.output.offerHuman).toBe(true);
    expect(r.validated).toBe(false);
  });

  it("A2 and A4 use no model at all in fixtures mode", async () => {
    const caller = vi.fn();
    const fixtures = { ...config, mode: "fixtures" as const };
    await readReceipt({ jpeg: Buffer.from("x"), sha256: "0".repeat(64), scenarioContext: "" }, { config: fixtures, caller, spend: memorySpendLog() });
    await answerQuestion("Hi", { text: "case", amountsCents: [] }, [], { config: fixtures, caller, spend: memorySpendLog() });
    expect(caller).not.toHaveBeenCalled();
  });
});
