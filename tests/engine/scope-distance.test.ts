import { describe, expect, it } from "vitest";
import { computePassenger, greatCircleKm } from "@/lib/engine";
import { ap, ctx, delayed, eur, pax, scenarioA } from "./helpers";

describe("scope (Art 3)", () => {
  it("REG-3-1: departure from an EU airport is in scope", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d), ctx);
    expect(r.inScope).toBe(true);
    expect(r.trace.find((s) => s.ruleId === "REG-3-1")?.outcome).toContain("Art 3(1)(a)");
  });

  it("REG-3-1: third country to EU on a Community carrier is in scope, with a human check on third-country benefits", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("DXB"), destination: ap("FRA") } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.inScope).toBe(true);
    const comp = r.entitlements.find((e) => e.kind === "COMPENSATION");
    expect(comp?.needsHumanCheck).toBe(true);
    expect(comp?.needsHumanCheckReason).toContain("Art 3(1)(b)");
  });

  it("REG-3-1: third country to EU on a non-Community carrier is out of scope", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("DXB"), destination: ap("FRA") }, carrier: { isCommunityCarrier: false } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.inScope).toBe(false);
    expect(r.outOfScope?.ruleId).toBe("REG-3-1");
  });

  it("REG-3-1: a UK departure is marked UK261 not supported", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("LHR"), destination: ap("JFK") } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.outOfScope?.reason).toContain("UK261");
  });

  it("REG-3-3: staff travel at a non-public reduced fare is out of scope with zero entitlements and a reason", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { fareType: "STAFF_REDUCED_NOT_PUBLIC" }), ctx);
    expect(r.inScope).toBe(false);
    expect(r.entitlements).toEqual([]);
    expect(r.outOfScope).toEqual({ reason: "reduced fare not available to the public (staff travel)", ruleId: "REG-3-3" });
  });

  it("REG-3-3: a free-of-charge ticket is out of scope", () => {
    const d = scenarioA();
    expect(computePassenger(d, pax(d, { fareType: "FREE_OF_CHARGE" }), ctx).outOfScope?.ruleId).toBe("REG-3-3");
  });

  it("REG-3-3: a frequent flyer award ticket is covered and paid 600 EUR", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { fareType: "FREQUENT_FLYER_AWARD" }), ctx);
    expect(r.inScope).toBe(true);
    expect(eur(r, "COMPENSATION")).toBe(600);
  });

  it("REG-3-2: the check-in condition is not applied to cancellations", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d, { checkedInOnTime: false }), ctx);
    expect(r.inScope).toBe(true);
  });

  it("REG-3-2: a delayed passenger who did not check in on time is out of scope", () => {
    const { d, p } = delayed("FRA", "VIE", 200, 200, { checkedInOnTime: false });
    expect(computePassenger(d, p, ctx).outOfScope?.ruleId).toBe("REG-3-2");
  });

  it("REG-3-2: no confirmed reservation is out of scope", () => {
    const d = scenarioA();
    expect(computePassenger(d, pax(d, { confirmedReservation: false }), ctx).outOfScope?.ruleId).toBe("REG-3-2");
  });
});

describe("distance and band (Art 7(1), 7(4), Bossen)", () => {
  it("REG-7-1: Frankfurt to Dubai is band B3, 600 EUR", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d), ctx);
    expect(r.band).toBe("B3");
    expect(r.distanceKm).toBeGreaterThan(4700);
    expect(r.distanceKm).toBeLessThan(5000);
  });

  it("REG-7-1: Milan Malpensa to Lisbon is intra-Community over 1500 km, band B2", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("MXP"), destination: ap("LIS") } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.band).toBe("B2");
    expect(eur(r, "COMPENSATION")).toBe(400);
  });

  it("REG-7-1: Frankfurt to Vienna is band B1, 250 EUR", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("FRA"), destination: ap("VIE") } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.band).toBe("B1");
    expect(eur(r, "COMPENSATION")).toBe(250);
  });

  it("REG-7-1: Helsinki to Gran Canaria is intra-Community over 3500 km, so band B2 and 400 EUR", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("HEL"), destination: ap("LPA") } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.distanceKm).toBeGreaterThan(3500);
    expect(r.band).toBe("B2");
    expect(eur(r, "COMPENSATION")).toBe(400);
  });

  it("REG-7-1: a non-intra-Community flight between 1500 and 3500 km is band B2 (Frankfurt to Cairo)", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("FRA"), destination: ap("CAI") } });
    const r = computePassenger(d, pax(d), ctx);
    expect(r.distanceKm).toBeGreaterThan(1500);
    expect(r.distanceKm).toBeLessThanOrEqual(3500);
    expect(r.band).toBe("B2");
  });

  it("CJEU-C-559-16: a connection Frankfurt-Vienna-Larnaca uses the Frankfurt to Larnaca distance", () => {
    const d = scenarioA({ flight: { ...scenarioA().flight, origin: ap("FRA"), destination: ap("VIE") } });
    const r = computePassenger(d, pax(d, { finalDestination: ap("LCA") }), ctx);
    expect(r.distanceKm).toBe(greatCircleKm(ap("FRA"), ap("LCA")));
    expect(r.band).toBe("B2");
    expect(r.trace.some((s) => s.ruleId === "CJEU-C-559-16")).toBe(true);
  });

  it("REG-7-4: the trace records the formula and earth radius, and the distance is rounded down", () => {
    const d = scenarioA();
    const r = computePassenger(d, pax(d), ctx);
    const s = r.trace.find((x) => x.ruleId === "REG-7-4");
    expect(s?.inputs.earthRadiusKm).toBe(6371);
    expect(String(s?.inputs.formula)).toContain("haversine");
    expect(Number.isInteger(r.distanceKm)).toBe(true);
  });
});
