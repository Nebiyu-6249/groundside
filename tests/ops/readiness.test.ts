import { describe, expect, it } from "vitest";
import { readinessChecks, type ReadinessInput } from "@/lib/ops/readiness";

const base: ReadinessInput = {
  requiredAirports: ["EDDF", "OMDB", "LEMD"],
  airportsWithFacts: ["EDDF", "OMDB", "LEMD"],
  assessment: { valid: true, usedFixture: false },
  ruleIdsUsed: ["REG-7-1-c", "REG-5-1-b"],
  ruleStatus: new Map([["REG-7-1-c", "VERIFIED"], ["REG-5-1-b", "VERIFIED"], ["X-1", "UNVERIFIED"]]),
  passengersMissingContact: [],
  payableCents: 100_000,
  capRemainingCents: 2_000_000,
  balanceEstimateCents: null,
  lastWebhookAt: "2026-11-05T04:00:00.000Z",
};
const check = (i: ReadinessInput, id: string) => readinessChecks(i).find((c) => c.id === id)!;

describe("readiness panel (SPEC F6)", () => {
  it("is all clear when every input is present", () => {
    expect(readinessChecks(base).every((c) => c.ok)).toBe(true);
  });
  it("flags an airport without weather facts", () => {
    const c = check({ ...base, airportsWithFacts: ["EDDF", "OMDB"] }, "evidence");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("LEMD");
  });
  it("flags a missing, invalid or cached assessment", () => {
    expect(check({ ...base, assessment: null }, "assessment").ok).toBe(false);
    expect(check({ ...base, assessment: { valid: false, usedFixture: false } }, "assessment").ok).toBe(false);
    expect(check({ ...base, assessment: { valid: true, usedFixture: true } }, "assessment").detail).toContain("Cached");
  });
  it("flags a rule used by the disruption that is not VERIFIED", () => {
    const c = check({ ...base, ruleIdsUsed: [...base.ruleIdsUsed, "X-1", "UNKNOWN"] }, "rules");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("X-1, UNKNOWN");
  });
  it("lists passengers without contact details", () => {
    const c = check({ ...base, passengersMissingContact: ["Ana Ruiz"] }, "contact");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("Ana Ruiz");
  });
  it("adds the 2 percent sandbox fee and compares with the lower of cap and balance", () => {
    expect(check({ ...base, payableCents: 100_000, capRemainingCents: 101_999 }, "money").ok).toBe(false);
    expect(check({ ...base, payableCents: 100_000, capRemainingCents: 102_000 }, "money").ok).toBe(true);
    expect(check({ ...base, balanceEstimateCents: 50_000 }, "money").ok).toBe(false);
  });
  it("never blocks on webhooks, because polling reconciles", () => {
    expect(check({ ...base, lastWebhookAt: null }, "webhooks").ok).toBe(true);
  });
});
