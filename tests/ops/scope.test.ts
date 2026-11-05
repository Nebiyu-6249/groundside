import { describe, expect, it } from "vitest";
import { disruptionScope } from "@/lib/auth/scope";
import { judgeModeOn } from "@/lib/judge/run";

describe("judge scoping (SPEC 13, 14)", () => {
  it("limits a judge to their own run and everyone else to non-judge disruptions", () => {
    expect(disruptionScope({ judgeRunId: "run1" })).toEqual({ judgeRunId: "run1" });
    expect(disruptionScope({ judgeRunId: null })).toEqual({ judgeRunId: null });
  });
  it("turns judge mode on only for JUDGE_MODE=true", () => {
    expect(judgeModeOn({ JUDGE_MODE: "true" })).toBe(true);
    expect(judgeModeOn({ JUDGE_MODE: "false" })).toBe(false);
    expect(judgeModeOn({})).toBe(false);
  });
});
