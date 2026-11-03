import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { airlinePolicySchema } from "@/lib/engine/policy";
import { citableIds, loadRulePack } from "@/lib/rules/pack";

const rules = loadRulePack();
const byId = new Map(rules.map((r) => [r.id, r]));

// Every candidate listed in docs/SPEC.md 6.2.
const SPEC_CANDIDATES = [
  "REG-2-H", "REG-2-L", "REG-3-1", "REG-3-2", "REG-3-3", "REG-5-1-A", "REG-5-1-B", "REG-5-1-C",
  "REG-5-3", "REG-5-4", "REG-6-1", "REG-7-1", "REG-7-2", "REG-7-3", "REG-7-4", "REG-8-1",
  "REG-9-1", "REG-9-2", "REG-9-3", "REG-11", "REG-14-2", "REG-15", "REG-REC-14", "REG-REC-15",
  "CJEU-C-402-07", "CJEU-C-402-07-P63", "CJEU-C-581-10", "CJEU-C-11-11", "CJEU-C-559-16",
  "CJEU-C-452-13", "CJEU-C-12-11", "CJEU-C-549-07", "CJEU-C-257-14", "CJEU-C-315-15",
  "CJEU-C-74-19", "CJEU-C-28-20", "CJEU-C-195-17", "CJEU-C-156-22", "CJEU-C-294-10",
  "POL-MEALS", "POL-HOTEL", "POL-TRANSPORT", "POL-RECEIPTS", "POL-FX", "POL-ART7-2",
];

describe("rule pack (SPEC 6)", () => {
  it("contains every SPEC 6.2 candidate", () => {
    expect(SPEC_CANDIDATES.filter((id) => !byId.has(id))).toEqual([]);
  });

  it("contains no entries beyond the SPEC candidates except the Commission guidance used by the engine", () => {
    expect(rules.map((r) => r.id).filter((id) => !SPEC_CANDIDATES.includes(id))).toEqual(["COM-GL-2024-4-3-1"]);
  });

  it("links law and case law to an official CELEX text", () => {
    for (const r of rules.filter((r) => r.kind !== "POLICY")) {
      expect(r.celex, r.id).toMatch(/^\d{5}[A-Z]{1,2}\d{4,5}/);
      expect(r.verifiedAgainst, r.id).toContain("publications.europa.eu/resource/celex/");
    }
  });

  it("lets the AI cite only verified law and case law, and policy only when asked", () => {
    const withoutPolicy = citableIds(rules, { includePolicy: false });
    expect(withoutPolicy.has("REG-5-3")).toBe(true);
    expect(withoutPolicy.has("CJEU-C-549-07")).toBe(true);
    expect(withoutPolicy.has("POL-MEALS")).toBe(false);
    expect(withoutPolicy.has("COM-GL-2024-4-3-1")).toBe(false);
    expect(citableIds(rules, { includePolicy: true }).has("POL-MEALS")).toBe(true);
  });

  it("matches the policy entries to data/policy/demo-air.json (POL-MEALS, POL-HOTEL, POL-TRANSPORT)", () => {
    const policy = airlinePolicySchema.parse(
      JSON.parse(readFileSync(path.join(process.cwd(), "data", "policy", "demo-air.json"), "utf8")),
    );
    expect(byId.get("POL-MEALS")?.excerpt).toContain(`${policy.mealAllowanceFirstEur} EUR when the care trigger`);
    expect(byId.get("POL-MEALS")?.excerpt).toContain(`at most ${policy.mealAllowanceMaxPer24hEur} EUR per 24 hours`);
    expect(byId.get("POL-HOTEL")?.excerpt).toContain(`${policy.hotelCapPerNightEur} EUR per night`);
    expect(byId.get("POL-TRANSPORT")?.excerpt).toContain(`${policy.groundTransportCapEachWayEur} EUR each way`);
    expect(byId.get("POL-RECEIPTS")?.excerpt).toContain(`${policy.receiptWindowBeforeSchedDepMinutes} minutes before`);
  });
});
