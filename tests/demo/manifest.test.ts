import { describe, expect, it } from "vitest";
import { computePassenger, type DisruptionInput } from "@/lib/engine";
import { fullManifest, payoutReceiver, quickManifest } from "@/lib/demo/manifest";
import { loadScenario, resolveTimes } from "@/lib/demo/scenarios";
import { zonedToUtc } from "@/lib/demo/zoned";
import { loadAirports } from "@/lib/demo/seed";
import { ctx } from "../engine/helpers";

const airports = new Map(loadAirports().map((a) => [a.icao, a]));

describe("local time to UTC", () => {
  it("converts Frankfurt and Dubai winter times", () => {
    expect(zonedToUtc("2026-01-15", "21:50", "Europe/Berlin").toISOString()).toBe("2026-01-15T20:50:00.000Z");
    expect(zonedToUtc("2026-01-15", "06:55", "Asia/Dubai", 1).toISOString()).toBe("2026-01-16T02:55:00.000Z");
  });

  it("handles summer time", () => {
    expect(zonedToUtc("2026-07-15", "21:50", "Europe/Berlin").toISOString()).toBe("2026-07-15T19:50:00.000Z");
    expect(zonedToUtc("2026-07-15", "07:10", "Europe/Lisbon").toISOString()).toBe("2026-07-15T06:10:00.000Z");
  });
});

describe("scenario definitions (docs/DEMO.md 2)", () => {
  it("resolves scenario A times in each airport's zone", () => {
    const t = resolveTimes(loadScenario("A"), airports);
    expect(t.schedDep.toISOString()).toBe("2026-01-15T20:50:00.000Z");
    expect(t.informedAt.toISOString()).toBe("2026-01-15T19:30:00.000Z");
    expect(t.reroutingDep.toISOString()).toBe("2026-01-16T09:15:00.000Z");
    expect(t.reroutingArr.toISOString()).toBe("2026-01-16T15:20:00.000Z");
  });

  it("keeps the ops note and maintenance log verbatim", () => {
    const a = loadScenario("A");
    expect(a.opsNote.startsWith("DEMO 412 FRA-DXB CNL. Reason: adverse weather.")).toBe(true);
    expect(a.maintenanceLog).toContain("EDP 2 failed on ground check");
    expect(loadScenario("B").opsNote).toContain("RVR below company minima");
  });

  it("marks both dates as placeholders until Phase 2", () => {
    expect(loadScenario("A").dateIsPlaceholder).toBe(true);
    expect(loadScenario("B").dateIsPlaceholder).toBe(true);
  });
});

describe("synthetic manifests (docs/DEMO.md 2.5)", () => {
  const a = loadScenario("A");

  it("builds the 12 quick-run cases in table order", () => {
    const q = quickManifest(a);
    expect(q.map((e) => e.quickCase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(q[3].finalDestination).toBe("HAAB");
    expect(q[4].fareType).toBe("FREQUENT_FLYER_AWARD");
    expect(q[5].fareType).toBe("STAFF_REDUCED_NOT_PUBLIC");
    expect(q[6].priorityReason).toBe("REDUCED_MOBILITY");
    expect(q[7].receiverKind).toBe("UNREGISTERED");
    expect(q[8].demoScript).toBe("BANK_TRANSFER");
    expect(q[9].choice).toBe("REFUND");
    expect(q[10].displayEmail).toBeNull();
    expect(q[11].demoScript).toBe("NO_RESPONSE");
  });

  it("builds the full run with the group sizes and overlays of scenario A", () => {
    const f = fullManifest(a);
    expect(f).toHaveLength(180);
    expect(f.filter((e) => e.finalDestination !== "OMDB")).toHaveLength(10);
    expect(f.filter((e) => e.fareType === "FREQUENT_FLYER_AWARD")).toHaveLength(6);
    expect(f.filter((e) => e.fareType === "STAFF_REDUCED_NOT_PUBLIC")).toHaveLength(4);
    expect(f.filter((e) => e.priorityReason === "REDUCED_MOBILITY")).toHaveLength(4);
    expect(f.filter((e) => e.priorityReason === "UNACCOMPANIED_MINOR")).toHaveLength(2);
    expect(f.filter((e) => e.receiverKind === "UNREGISTERED")).toHaveLength(12);
    expect(f.filter((e) => e.displayEmail === null)).toHaveLength(3);
    expect(f.filter((e) => e.choice === "REFUND")).toHaveLength(8);
    expect(new Set(f.map((e) => e.displayName)).size).toBe(180);
  });

  it("is deterministic for a given seed", () => {
    expect(fullManifest(a)).toEqual(fullManifest(a));
    expect(quickManifest(a, 1)).not.toEqual(quickManifest(a, 2));
  });

  it("maps receivers to pool accounts, reserved-domain addresses or none", () => {
    const q = quickManifest(a);
    const pool = ["one@pool.test", "two@pool.test"];
    expect(payoutReceiver(q[0], pool, "pax-{n}@example.com")).toBe("one@pool.test");
    expect(payoutReceiver(q[7], pool, "pax-{n}@example.com")).toBe("pax-0008@example.com");
    expect(payoutReceiver(q[10], pool, "pax-{n}@example.com")).toBeNull();
  });
});

describe("expected scenario outcomes from docs/DEMO.md", () => {
  function engineFor(key: "A" | "B", finalIcao?: string) {
    const s = loadScenario(key);
    const t = resolveTimes(s, airports);
    const origin = airports.get(s.flight.origin)!;
    const destination = airports.get(s.flight.destination)!;
    const d: DisruptionInput = { type: s.type, flight: { origin, destination, schedDep: t.schedDep, schedArr: t.schedArr }, informedAt: t.informedAt, carrier: { isCommunityCarrier: true }, decision: "COMPENSATION_APPROVED" };
    const final = airports.get(finalIcao ?? s.flight.destination)!;
    const onward = t.onward[final.icao];
    return computePassenger(d, {
      firstDeparture: origin, finalDestination: final, fareType: "PUBLIC", confirmedReservation: true, checkedInOnTime: true,
      schedArrFinal: onward?.schedArrFinal ?? t.schedArr,
      rerouting: { offered: true, accepted: true, dep: t.reroutingDep, arrFinal: onward?.reroutedArrFinal ?? t.reroutingArr },
      choice: "REROUTING", booking: { totalCents: s.fareCents, segments: [] },
    }, ctx);
  }
  const amount = (r: ReturnType<typeof engineFor>, kind: string) => r.entitlements.find((e) => e.kind === kind)!.amountCents / 100;

  it("REG-5-1-C: scenario A owes 600 EUR with no reduction, plus meals, one hotel night and transport", () => {
    const r = engineFor("A");
    expect(r.band).toBe("B3");
    expect(amount(r, "COMPENSATION")).toBe(600);
    expect(amount(r, "HOTEL_REIMBURSEMENT_CAP")).toBe(160);
    expect(amount(r, "TRANSPORT_REIMBURSEMENT_CAP")).toBe(80);
  });

  it("CJEU-C-559-16: scenario A connecting to Addis Ababa is measured Frankfurt to Addis Ababa", () => {
    const r = engineFor("A", "HAAB");
    expect(r.trace.find((s) => s.ruleId === "REG-7-4")?.inputs.to).toBe("HAAB");
    expect(amount(r, "COMPENSATION")).toBe(600);
  });

  it("REG-7-1: scenario B is intra-Community B2, 400 EUR if owed, with care and a hotel night", () => {
    const r = engineFor("B");
    expect(r.band).toBe("B2");
    expect(r.distanceKm).toBeGreaterThan(1500);
    expect(amount(r, "COMPENSATION")).toBe(400);
    expect(amount(r, "HOTEL_REIMBURSEMENT_CAP")).toBe(160);
  });
});
