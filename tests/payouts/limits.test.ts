import { describe, expect, it } from "vitest";
import { holdMessage, startOfUtcDay } from "@/lib/payouts/limits";

describe("payout holds (SPEC 14 guard rails)", () => {
  it("explains a cap hold with the amounts, when it lifts and that the demo goes on", () => {
    const m = holdMessage({ kind: "CAP", capCents: 2_000_000, sentTodayCents: 1_995_000, resumesAt: "2026-12-02T00:00:00.000Z" }, { count: 3, cents: 180_000 });
    expect(m).toContain("19950.00 EUR of 20000.00 EUR sent since 00:00 UTC, and the next payments do not fit");
    expect(m).toContain("3 payments (1800.00 EUR) are queued");
    expect(m).toContain("after 00:00 UTC (2026-12-02)");
    expect(m).toContain("Everything else in the demo still works");
  });

  it("explains a balance hold without blaming the judge", () => {
    const m = holdMessage({ kind: "BALANCE", capCents: 2_000_000, sentTodayCents: 0, resumesAt: null }, { count: 1, cents: 60_000 });
    expect(m).toContain("sandbox balance has run out");
    expect(m).toContain("1 payment (600.00 EUR) is queued");
    expect(m).toContain("Everything else in the demo still works");
  });

  it("counts the cap per UTC day", () => {
    expect(startOfUtcDay(new Date("2026-12-01T23:59:00+04:00")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(startOfUtcDay(new Date("2026-12-02T03:30:00+04:00")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
