import { describe, expect, it } from "vitest";
import { computePassenger, reconcile, type StoredEntitlement } from "@/lib/engine";
import { mealAllowanceCents } from "@/lib/engine/care";
import { addMin, cites, ctx, delayed, ent, eur, pax, policy, rules, scenarioA, t } from "./helpers";

const scenarioARerouting = { offered: true, accepted: true, dep: t("2026-01-16T09:15:00Z"), arrFinal: t("2026-01-16T15:20:00Z") };

describe("care triggers (Art 5(1)(b), 6(1))", () => {
  const thresholds: [string, string, string, number][] = [["B1", "FRA", "VIE", 120], ["B2", "MXP", "LIS", 180], ["B3", "FRA", "DXB", 240]];
  for (const [band, from, to, threshold] of thresholds) {
    it(`REG-6-1: ${band} delay gives care from ${threshold} min, not at ${threshold - 1}`, () => {
      const below = delayed(from, to, threshold - 1, threshold - 1);
      const at = delayed(from, to, threshold, threshold);
      expect(ent(computePassenger(below.d, below.p, ctx), "MEAL_ALLOWANCE").status).toBe("NOT_OWED");
      expect(ent(computePassenger(at.d, at.p, ctx), "MEAL_ALLOWANCE").status).toBe("READY");
    });
  }

  it("REG-5-1-B: scenario A cancellation re-routed next morning gets meals, one hotel night and transport", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { rerouting: scenarioARerouting, choice: "REROUTING" }), ctx);
    expect(eur(r, "MEAL_ALLOWANCE")).toBe(60);
    expect(eur(r, "HOTEL_REIMBURSEMENT_CAP")).toBe(160);
    expect(eur(r, "TRANSPORT_REIMBURSEMENT_CAP")).toBe(80);
    expect(cites(r, "HOTEL_REIMBURSEMENT_CAP", "POL-HOTEL")).toBe(true);
  });

  it("REG-5-1-B: a same-day re-routing gives meals but no hotel", () => {
    const d = scenarioA();
    const sameDay = { offered: true, accepted: true, dep: addMin(d.flight.schedDep, 90), arrFinal: addMin(d.flight.schedArr, 90) };
    const r = computePassenger(d, pax(d, { rerouting: sameDay, choice: "REROUTING" }), ctx);
    expect(eur(r, "MEAL_ALLOWANCE")).toBe(15);
    expect(ent(r, "HOTEL_REIMBURSEMENT_CAP").status).toBe("NOT_OWED");
  });

  it("REG-6-1: a delay whose expected departure moves to the next day gives a hotel", () => {
    const { d, p } = delayed("FRA", "VIE", 20 * 60, 20 * 60);
    const r = computePassenger(d, p, ctx);
    expect(eur(r, "HOTEL_REIMBURSEMENT_CAP")).toBe(160);
    expect(eur(r, "TRANSPORT_REIMBURSEMENT_CAP")).toBe(80);
  });

  it("REG-9-1: a duty manager overnight flag gives a hotel even for a same-day departure", () => {
    const d = scenarioA();
    const sameDay = { offered: true, accepted: true, dep: addMin(d.flight.schedDep, 60), arrFinal: addMin(d.flight.schedArr, 60) };
    const r = computePassenger(d, pax(d, { rerouting: sameDay, choice: "REROUTING", overnightStayNecessary: true }), ctx);
    expect(eur(r, "HOTEL_REIMBURSEMENT_CAP")).toBe(160);
  });

  it("POL-MEALS: 15 EUR at the trigger, 15 more per further 4 hours, at most 60 per 24 hours", () => {
    expect(mealAllowanceCents(0, 0, policy)).toBe(1500);
    expect(mealAllowanceCents(239, 0, policy)).toBe(1500);
    expect(mealAllowanceCents(240, 0, policy)).toBe(3000);
    expect(mealAllowanceCents(745, 0, policy)).toBe(6000);
    expect(mealAllowanceCents(1400, 0, policy)).toBe(6000);
    expect(mealAllowanceCents(1500, 0, policy)).toBe(10500);
    expect(mealAllowanceCents(300, 240, policy)).toBe(1500);
  });

  it("REG-11: a passenger with reduced mobility is flagged for priority and the care trace says why", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { rerouting: scenarioARerouting, choice: "REROUTING", priorityReason: "REDUCED_MOBILITY" }), ctx);
    expect(r.priority).toBe("REDUCED_MOBILITY");
    expect(cites(r, "MEAL_ALLOWANCE", "REG-11")).toBe(true);
    expect(cites(r, "MEAL_ALLOWANCE", "REG-9-3")).toBe(true);
  });
});

describe("refund (Art 6(1)(iii), 8(1))", () => {
  it("REG-6-1: a departure delay of 299 min gives no refund right", () => {
    const { d, p } = delayed("FRA", "VIE", 299, 299);
    expect(ent(computePassenger(d, p, ctx), "REFUND").status).toBe("NOT_OWED");
  });

  it("REG-6-1: a departure delay of 300 min gives a refund right of the full ticket", () => {
    const { d, p } = delayed("FRA", "VIE", 300, 300, { choice: "REFUND" });
    const e = ent(computePassenger(d, p, ctx), "REFUND");
    expect(e.status).toBe("READY");
    expect(e.amountCents).toBe(18_900);
  });

  it("REG-5-1-A: a cancellation offers a refund until the passenger chooses", () => {
    const d = scenarioA();
    expect(ent(computePassenger(d, pax(d), ctx), "REFUND").status).toBe("OFFERED");
    expect(ent(computePassenger(d, pax(d, { choice: "REROUTING" }), ctx), "REFUND").status).toBe("NOT_OWED");
  });

  it("REG-8-1: a multi-segment refund covers unused segments, and flown ones only when the journey no longer serves its purpose", () => {
    const d = scenarioA();
    const segments = [
      { origin: "MAD", destination: "FRA", priceCents: 9_000, flown: true },
      { origin: "FRA", destination: "DXB", priceCents: 21_000, flown: false },
    ];
    const unused = computePassenger(d, pax(d, { choice: "REFUND", booking: { totalCents: 30_000, segments } }), ctx);
    expect(eur(unused, "REFUND")).toBe(210);
    const all = computePassenger(d, pax(d, { choice: "REFUND", booking: { totalCents: 30_000, segments, journeyNoLongerServesPurpose: true } }), ctx);
    expect(eur(all, "REFUND")).toBe(300);
  });

  it("REG-8-1: missing segment prices on a multi-segment refund need a human check", () => {
    const d = scenarioA();
    const segments = [{ origin: "FRA", destination: "VIE", flown: false }, { origin: "VIE", destination: "LCA", flown: false }];
    const e = ent(computePassenger(d, pax(d, { choice: "REFUND", booking: { totalCents: 30_000, segments } }), ctx), "REFUND");
    expect(e.status).toBe("NEEDS_HUMAN_CHECK");
  });

  it("COM-GL-2024-4-3-1: choosing a refund ends care, so no hotel or transport and only the first meal allowance", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { rerouting: scenarioARerouting, choice: "REFUND" }), ctx);
    expect(eur(r, "MEAL_ALLOWANCE")).toBe(15);
    expect(ent(r, "HOTEL_REIMBURSEMENT_CAP").status).toBe("NOT_OWED");
    expect(cites(r, "HOTEL_REIMBURSEMENT_CAP", "COM-GL-2024-4-3-1")).toBe(true);
  });
});

describe("traceability and re-runs", () => {
  it("REG-7-1: every trace step in scenario A cites a VERIFIED rule from the pack", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { rerouting: scenarioARerouting, choice: "REROUTING" }), ctx);
    const verified = new Set(rules.filter((x) => x.status === "VERIFIED").map((x) => x.id));
    for (const e of r.entitlements) for (const s of e.trace) expect(verified.has(s.ruleId), s.ruleId).toBe(true);
    expect(r.entitlements.every((e) => !e.needsHumanCheck)).toBe(true);
  });

  it("REG-7-1: a re-run never changes a paid entitlement and flags a conflict instead", () => {
    const d = scenarioA();
    const computed = computePassenger(d, pax(d, { rerouting: scenarioARerouting, choice: "REROUTING" }), ctx).entitlements;
    const stored: StoredEntitlement[] = [
      { id: "e1", kind: "COMPENSATION", status: "PAID", amountCents: 30_000, payoutInFlight: false },
      { id: "e2", kind: "MEAL_ALLOWANCE", status: "READY", amountCents: 1_500, payoutInFlight: false },
      { id: "e3", kind: "HOTEL_REIMBURSEMENT_CAP", status: "OFFERED", amountCents: 16_000, payoutInFlight: true },
    ];
    const actions = reconcile(stored, computed);
    expect(actions.find((a) => a.kind === "COMPENSATION")).toMatchObject({ action: "CONFLICT", storedAmountCents: 30_000, computedAmountCents: 60_000 });
    expect(actions.find((a) => a.kind === "MEAL_ALLOWANCE")).toMatchObject({ action: "UPDATE", id: "e2" });
    expect(actions.find((a) => a.kind === "HOTEL_REIMBURSEMENT_CAP")).toMatchObject({ action: "KEEP", id: "e3" });
    expect(actions.find((a) => a.kind === "TRANSPORT_REIMBURSEMENT_CAP")).toMatchObject({ action: "CREATE" });
  });

  it("REG-7-1: running the engine twice on the same input gives identical output", () => {
    const d = scenarioA();
    const p = pax(d, { rerouting: scenarioARerouting, choice: "REROUTING" });
    expect(computePassenger(d, p, ctx)).toEqual(computePassenger(d, p, ctx));
    const stored = computePassenger(d, p, ctx).entitlements.map((e, i) => ({ id: `e${i}`, kind: e.kind, status: e.status, amountCents: e.amountCents, payoutInFlight: false }));
    expect(reconcile(stored, computePassenger(d, p, ctx).entitlements).every((a) => a.action === "KEEP")).toBe(true);
  });
});
