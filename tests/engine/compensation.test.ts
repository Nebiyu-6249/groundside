import { describe, expect, it } from "vitest";
import { computePassenger, type EngineContext } from "@/lib/engine";
import { ap, cancelled, cites, ctx, DAY, delayed, ent, eur, pax, scenarioA } from "./helpers";

describe("cancellation notice windows (Art 5(1)(c))", () => {
  it("REG-5-1-C: informed exactly 14 days before departure, exception (i), no compensation", () => {
    const { d, p } = cancelled("FRA", "VIE", 14 * DAY);
    expect(ent(computePassenger(d, p, ctx), "COMPENSATION").status).toBe("NOT_OWED");
  });

  it("REG-5-1-C: informed 13 days ahead with no re-routing, compensation owed", () => {
    const { d, p } = cancelled("FRA", "VIE", 13 * DAY);
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(250);
  });

  it("REG-5-1-C: informed 13 days ahead, re-routed 2 h early and 3 h 59 min late, exception (ii), no compensation", () => {
    const { d, p } = cancelled("FRA", "VIE", 13 * DAY, { depOffset: -120, arrLate: 239 });
    expect(ent(computePassenger(d, p, ctx), "COMPENSATION").status).toBe("NOT_OWED");
  });

  it("REG-5-1-C: informed 13 days ahead, re-routed arriving exactly 4 h late, compensation owed", () => {
    const { d, p } = cancelled("FRA", "VIE", 13 * DAY, { depOffset: 0, arrLate: 240 });
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(250);
  });

  it("REG-5-1-C: informed 13 days ahead, re-routed departing 2 h 1 min early, compensation owed", () => {
    // Offered but not accepted, so the Article 7(2) reduction does not mix in.
    const { d, p } = cancelled("FRA", "VIE", 13 * DAY, { depOffset: -121, arrLate: 0, accepted: false });
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(250);
  });

  it("REG-5-1-C: informed exactly 7 days ahead falls in window (ii), so a 3 h late re-routing is exempt", () => {
    const { d, p } = cancelled("FRA", "VIE", 7 * DAY, { depOffset: 0, arrLate: 180 });
    expect(ent(computePassenger(d, p, ctx), "COMPENSATION").status).toBe("NOT_OWED");
  });

  it("REG-5-1-C: informed 6 days ahead, re-routed 1 h early and 1 h 59 min late, exception (iii), no compensation", () => {
    const { d, p } = cancelled("FRA", "VIE", 6 * DAY, { depOffset: -60, arrLate: 119 });
    expect(ent(computePassenger(d, p, ctx), "COMPENSATION").status).toBe("NOT_OWED");
  });

  it("REG-5-1-C: informed 6 days ahead, re-routed arriving exactly 2 h late, compensation owed", () => {
    const { d, p } = cancelled("FRA", "VIE", 6 * DAY, { depOffset: 0, arrLate: 120, accepted: false });
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(250);
  });

  it("REG-5-1-C: informed 6 days ahead, re-routed departing 61 min early, compensation owed", () => {
    const { d, p } = cancelled("FRA", "VIE", 6 * DAY, { depOffset: -61, arrLate: 0, accepted: false });
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(250);
  });

  it("REG-5-4: no record of when passengers were informed means no notice exception applies", () => {
    const { d, p } = cancelled("FRA", "VIE", 20 * DAY);
    const r = computePassenger({ ...d, informedAt: undefined }, p, ctx);
    expect(eur(r, "COMPENSATION")).toBe(250);
    expect(cites(r, "COMPENSATION", "REG-5-4")).toBe(true);
  });

  it("REG-5-1-C: scenario A (told the same evening, re-routed next morning) owes the full 600 EUR", () => {
    const d = scenarioA();
    const p = pax(d, { rerouting: { offered: true, accepted: true, dep: new Date("2026-01-16T09:15:00Z"), arrFinal: new Date("2026-01-16T15:20:00Z") }, choice: "REROUTING" });
    const r = computePassenger(d, p, ctx);
    expect(eur(r, "COMPENSATION")).toBe(600);
    expect(ent(r, "COMPENSATION").status).toBe("READY");
  });
});

describe("delay compensation (Sturgeon, Nelson, Folkerts, Germanwings)", () => {
  it("CJEU-C-402-07: arriving 179 minutes late gives no compensation", () => {
    const { d, p } = delayed("FRA", "VIE", 170, 179);
    expect(ent(computePassenger(d, p, ctx), "COMPENSATION").status).toBe("NOT_OWED");
  });

  it("CJEU-C-402-07: arriving 180 minutes late gives compensation", () => {
    const { d, p } = delayed("FRA", "VIE", 170, 180);
    const r = computePassenger(d, p, ctx);
    expect(eur(r, "COMPENSATION")).toBe(250);
    expect(cites(r, "COMPENSATION", "CJEU-C-581-10")).toBe(true);
  });

  it("CJEU-C-452-13: the door-open time counts, so on blocks 2 h 57 min late but door open 3 h 4 min late is owed", () => {
    const { d, p } = delayed("FRA", "VIE", 170, 184);
    const r = computePassenger(d, p, ctx);
    expect(eur(r, "COMPENSATION")).toBe(250);
    expect(ent(r, "COMPENSATION").trace.find((s) => s.ruleId === "CJEU-C-402-07")?.inputs.arrivalDelayMinutes).toBe(184);
  });

  it("CJEU-C-11-11: a connection is measured at the final destination even when the first departure delay was short", () => {
    // FRA-VIE leaves 30 min late (under the 2 h care threshold), the passenger misses the
    // connection and reaches Larnaca 5 h 20 min late.
    const { d, p } = delayed("FRA", "VIE", 30, 320, { finalDestination: ap("LCA") });
    const r = computePassenger(d, p, ctx);
    expect(eur(r, "COMPENSATION")).toBe(400);
    expect(cites(r, "COMPENSATION", "CJEU-C-11-11")).toBe(true);
    expect(ent(r, "MEAL_ALLOWANCE").status).toBe("NOT_OWED");
  });

  it("CJEU-C-402-07-P63: a long-haul delay of 3 h 20 min is reduced by 50% to 300 EUR", () => {
    const { d, p } = delayed("FRA", "DXB", 200, 200);
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(300);
  });

  it("CJEU-C-402-07-P63: a long-haul delay of exactly 4 h is not reduced, 600 EUR", () => {
    const { d, p } = delayed("FRA", "DXB", 240, 240);
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(600);
  });

  it("CJEU-C-402-07-P63: if the paragraph is not verified, the reduced amount needs a human check", () => {
    const unverified: EngineContext = { ...ctx, rules: new Map([...ctx.rules, ["CJEU-C-402-07-P63", "UNVERIFIED"]]) };
    const { d, p } = delayed("FRA", "DXB", 200, 200);
    const e = ent(computePassenger(d, p, unverified), "COMPENSATION");
    expect(e.status).toBe("NEEDS_HUMAN_CHECK");
    expect(e.needsHumanCheckReason).toContain("CJEU-C-402-07-P63");
  });

  it("CJEU-C-452-13: an unknown arrival time at the final destination needs a human check", () => {
    const { d, p } = delayed("FRA", "VIE", 200, null);
    expect(ent(computePassenger(d, p, ctx), "COMPENSATION").status).toBe("NEEDS_HUMAN_CHECK");
  });
});

describe("Article 7(2) reduction for re-routed cancellations", () => {
  const cases: [string, string, string, number, number][] = [
    ["B1", "FRA", "VIE", 120, 125], ["B1", "FRA", "VIE", 121, 250],
    ["B2", "MXP", "LIS", 180, 200], ["B2", "MXP", "LIS", 181, 400],
    ["B3", "FRA", "DXB", 240, 300], ["B3", "FRA", "DXB", 241, 600],
  ];
  for (const [band, from, to, late, expected] of cases) {
    it(`REG-7-2: ${band} re-routing arriving ${late} min late pays ${expected} EUR`, () => {
      const { d, p } = cancelled(from, to, 2 * DAY, { depOffset: 0, arrLate: late });
      expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(expected);
    });
  }

  it("POL-ART7-2: when Demo Air policy turns the reduction off, the full amount is paid", () => {
    const noReduction: EngineContext = { ...ctx, policy: { ...ctx.policy, applyArt7_2Reduction: false } };
    // B2, 150 min late: outside exception (iii) (2 h) but inside the Article 7(2) limit (3 h).
    const { d, p } = cancelled("MXP", "LIS", 2 * DAY, { depOffset: 0, arrLate: 150 });
    expect(eur(computePassenger(d, p, ctx), "COMPENSATION")).toBe(200);
    expect(eur(computePassenger(d, p, noReduction), "COMPENSATION")).toBe(400);
  });
});

describe("extraordinary circumstances (Art 5(3)) are a human decision", () => {
  it("REG-5-3: while the decision is pending, compensation shows as awaiting decision with its amount", () => {
    const d = scenarioA({ decision: "PENDING" });
    const e = ent(computePassenger(d, pax(d), ctx), "COMPENSATION");
    expect(e.status).toBe("PENDING_DECISION");
    expect(e.amountCents).toBe(60_000);
  });

  it("REG-5-3: a signed denial sets compensation to 0 and cites the decision", () => {
    const d = scenarioA({ decision: "DENIAL_SIGNED", decisionId: "dec-42" });
    const e = ent(computePassenger(d, pax(d), ctx), "COMPENSATION");
    expect(e.amountCents).toBe(0);
    expect(e.trace.find((s) => s.ruleId === "REG-5-3")?.inputs.decisionId).toBe("dec-42");
  });

  it("CJEU-C-12-11: a signed denial leaves meals, hotel and transport unchanged", () => {
    const rerouting = { offered: true, accepted: true, dep: new Date("2026-01-16T09:15:00Z"), arrFinal: new Date("2026-01-16T15:20:00Z") };
    const approved = scenarioA();
    const denied = scenarioA({ decision: "DENIAL_SIGNED" });
    const a = computePassenger(approved, pax(approved, { rerouting, choice: "REROUTING" }), ctx);
    const b = computePassenger(denied, pax(denied, { rerouting, choice: "REROUTING" }), ctx);
    for (const kind of ["MEAL_ALLOWANCE", "HOTEL_REIMBURSEMENT_CAP", "TRANSPORT_REIMBURSEMENT_CAP"] as const) {
      expect(eur(b, kind)).toBe(eur(a, kind));
      expect(ent(b, kind).status).toBe("READY");
    }
    expect(cites(b, "HOTEL_REIMBURSEMENT_CAP", "CJEU-C-12-11")).toBe(true);
  });
});
