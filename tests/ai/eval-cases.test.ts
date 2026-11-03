import { describe, expect, it } from "vitest";
import { caseInput, loadA1Cases } from "@/lib/ai/a1/eval-cases";

describe("A1 eval cases (SPEC 15)", () => {
  const cases = loadA1Cases();

  it("has at least 12 cases covering the SPEC list", () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    for (const id of ["scenario-A", "scenario-B", "c-premature-component", "knock-on-previous-fog", "bird-strike-previous", "own-cabin-crew-strike", "atc-capacity-restriction", "crew-member-ill", "operational-reasons-only", "ops-note-in-german", "prompt-injection", "arrival-weather-well-above"]) {
      expect(cases.some((c) => c.id === id), id).toBe(true);
    }
  });

  it("builds facts from every case's weather through the real parser", () => {
    for (const c of cases) {
      const input = caseInput(c);
      expect(input.facts.length, c.id).toBeGreaterThan(0);
      expect(input.facts.some((f) => f.id.endsWith("-NODATA")), c.id).toBe(false);
    }
  });

  it("knock-on case shows fog at the previous departure airport and none at departure", () => {
    const input = caseInput(cases.find((c) => c.id === "knock-on-previous-fog")!);
    expect(input.facts.find((f) => f.id === "WX-EHAM-PREV_DEPARTURE-SIGWX")?.text).toContain("FG");
    expect(input.facts.find((f) => f.id === "WX-LOWW-DEPARTURE-SIGWX")?.text).toMatch(/^No fog/);
  });

  it("arrival-weather case includes TAF periods and marks TAF as available", () => {
    const input = caseInput(cases.find((c) => c.id === "arrival-weather-well-above")!);
    expect(input.tafAvailable).toBe(true);
    expect(input.facts.some((f) => f.id.startsWith("TAF-LPPT-"))).toBe(true);
  });
});
