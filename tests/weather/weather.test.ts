import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFacts } from "@/lib/weather/facts";
import { parseMetarReport, parseTafReport, significantWeather } from "@/lib/weather/parse";
import { loadScenarioWeather } from "@/lib/weather/scenario";
import { fetchRanges, weatherWindows } from "@/lib/weather/windows";

const at = (s: string) => new Date(s);

describe("METAR parsing (SPEC 7.2)", () => {
  it("reads fog, visibility, RVR per runway and vertical visibility", () => {
    const m = parseMetarReport("LIMC 220620Z VRB02KT 0100 R35R/0375N R17L/0375N R35L/0500N FZFG VV001 M01/M01 Q1001 NOSIG", at("2026-01-22T06:20:00Z"));
    expect(m.visibilityM).toBe(100);
    expect(m.rvr.map((r) => [r.runway, r.minM])).toEqual([["35R", 375], ["17L", 375], ["35L", 500]]);
    expect(m.weather).toEqual(["FZFG"]);
    expect(m.ceilingFt).toBe(100);
    expect(m.qnhHpa).toBe(1001);
    expect(significantWeather(m.weather)).toEqual(["FZFG"]);
  });

  it("reads CAVOK as 10 km or more with no ceiling", () => {
    const m = parseMetarReport("EDDF 242050Z AUTO 08005KT CAVOK 06/05 Q1014 NOSIG", at("2026-01-24T20:50:00Z"));
    expect(m.cavok).toBe(true);
    expect(m.visibilityM).toBe(9999);
    expect(m.ceilingFt).toBeNull();
  });

  it("finds the lowest broken or overcast layer as the ceiling and keeps intensity in weather codes", () => {
    const m = parseMetarReport("LEMD 141700Z 17012KT 9999 -SHRA FEW040 SCT060 BKN070 12/09 Q1008", at("2025-11-14T17:00:00Z"));
    expect(m.ceilingFt).toBe(7000);
    expect(m.weather).toEqual(["-SHRA"]);
    expect(significantWeather(m.weather)).toEqual([]);
  });

  it("parses a TAF into a base period and change groups", () => {
    const t = parseTafReport("TAF EDDF 241700Z 2418/2524 08005KT CAVOK TEMPO 2503/2508 0800 FG");
    expect(t.periods[0].kind).toBe("BASE");
    expect(t.periods[1].kind).toContain("TEMPO");
    expect(t.periods[1].weather).toEqual(["FG"]);
    expect(t.periods[1].visibilityM).toBe(800);
  });
});

describe("weather windows (SPEC 7.3)", () => {
  it("covers departure from 3 h before to 2 h after the later of departure or cancellation", () => {
    const w = weatherWindows({ origin: "EDDF", destination: "OMDB", schedDep: at("2026-01-24T20:50:00Z"), schedArr: at("2026-01-25T02:55:00Z"), cancelledAt: at("2026-01-24T22:00:00Z") });
    expect(w[0]).toMatchObject({ role: "DEPARTURE", from: at("2026-01-24T17:50:00Z"), to: at("2026-01-25T00:00:00Z") });
    expect(w[1]).toMatchObject({ role: "ARRIVAL", from: at("2026-01-25T00:55:00Z"), to: at("2026-01-25T04:55:00Z") });
  });

  it("merges windows at the same airport into one fetch range", () => {
    const w = weatherWindows({ origin: "EDDF", destination: "OMDB", schedDep: at("2026-01-24T20:50:00Z"), schedArr: at("2026-01-25T02:55:00Z"), previous: { origin: "LEMD", destination: "EDDF", schedDep: at("2026-01-24T16:30:00Z"), schedArr: at("2026-01-24T18:55:00Z") } });
    const eddf = fetchRanges(w).find((r) => r.icao === "EDDF")!;
    expect(eddf.roles).toEqual(["DEPARTURE", "PREV_ARRIVAL"]);
    expect(eddf.from).toEqual(at("2026-01-24T16:55:00Z"));
  });
});

describe("facts from the saved fixtures (SPEC 7.4)", () => {
  it("fixtures match the SHA-256 in their sidecars", () => {
    for (const [s, icao] of [["A", "EDDF"], ["A", "OMDB"], ["A", "LEMD"], ["B", "LIMC"], ["B", "LPPT"]]) {
      const body = readFileSync(`data/weather/${s}/${icao}-METAR.txt`);
      const meta = JSON.parse(readFileSync(`data/weather/${s}/${icao}-METAR.json`, "utf8"));
      expect(createHash("sha256").update(body).digest("hex"), `${s}/${icao}`).toBe(meta.sha256);
    }
  });

  it("scenario A: no fog, thunderstorm, snow or freezing precipitation in any window", () => {
    const { facts } = loadScenarioWeather("A");
    const sig = facts.filter((f) => f.id.endsWith("-SIGWX"));
    expect(sig.map((f) => f.id).sort()).toEqual(["WX-EDDF-DEPARTURE-SIGWX", "WX-EDDF-PREV_ARRIVAL-SIGWX", "WX-LEMD-PREV_DEPARTURE-SIGWX", "WX-OMDB-ARRIVAL-SIGWX"]);
    for (const f of sig) expect(f.text).toMatch(/^No fog, thunderstorm, snow or freezing precipitation/);
    expect(facts.find((f) => f.id === "WX-EDDF-DEPARTURE-MINVIS")?.value).toBe(9999);
  });

  it("scenario B: fog at Malpensa with RVR below the reference value, Lisbon clear", () => {
    const { facts } = loadScenarioWeather("B");
    const rvr = facts.find((f) => f.id === "WX-LIMC-DEPARTURE-MINRVR")!;
    expect(rvr.value).toBe(250);
    expect(rvr.text).toContain("below the 550 m reference value, which is not an operating minimum");
    expect(facts.find((f) => f.id === "WX-LIMC-DEPARTURE-FOGSPAN")).toBeDefined();
    expect(facts.find((f) => f.id === "WX-LPPT-ARRIVAL-SIGWX")?.text).toMatch(/^No fog/);
  });

  it("gives every fact a unique, stable ID and never says a flight was impossible", () => {
    for (const key of ["A", "B"] as const) {
      const { facts } = loadScenarioWeather(key);
      expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
      expect(facts.some((f) => /impossible|unsafe|could not operate/i.test(f.text))).toBe(false);
      expect(loadScenarioWeather(key).facts).toEqual(facts);
    }
  });

  it("reports a window with no data instead of inventing facts", () => {
    const w = weatherWindows({ origin: "EDDF", destination: "OMDB", schedDep: at("2026-01-24T20:50:00Z"), schedArr: at("2026-01-25T02:55:00Z") });
    const facts = buildFacts(w, new Map());
    expect(facts.map((f) => f.id)).toEqual(["WX-EDDF-DEPARTURE-NODATA", "WX-OMDB-ARRIVAL-NODATA"]);
  });
});
