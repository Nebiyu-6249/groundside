import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { airportTimeline } from "@/lib/weather/timeline";

const raw = readFileSync(path.join(process.cwd(), "data", "weather", "B", "LIMC-METAR.txt"), "utf8");
const flight = { number: "DEMO 218", schedDep: new Date("2026-01-22T06:40:00Z"), schedArr: new Date("2026-01-22T09:10:00Z"), actualDep: null, previous: null };

describe("weather timeline (SPEC 7.5)", () => {
  it("plots visibility, lowest RVR and ceiling from the real LIMC fog reports", () => {
    const t = airportTimeline({ airportIcao: "LIMC", raw, parsed: { roles: ["DEPARTURE"] } }, flight)!;
    expect(t.points.length).toBeGreaterThan(10);
    expect(t.points.every((p, i) => i === 0 || p.t >= t.points[i - 1].t)).toBe(true);
    expect(t.points.every((p) => p.visibilityM === null || p.visibilityM <= 10000)).toBe(true);
    // Scenario B: freezing fog with RVR as low as 250 m (data/weather/SOURCES.md).
    expect(Math.min(...t.points.map((p) => p.rvrM ?? Infinity))).toBeLessThanOrEqual(300);
  });

  it("marks only the flight times that belong to the airport's roles", () => {
    const dep = airportTimeline({ airportIcao: "LIMC", raw, parsed: { roles: ["DEPARTURE"] } }, flight)!;
    expect(dep.markers.map((m) => m.label)).toEqual(["DEMO 218 scheduled departure"]);
    const arr = airportTimeline({ airportIcao: "LIMC", raw, parsed: { roles: ["ARRIVAL"] } }, flight)!;
    expect(arr.markers.map((m) => m.label)).toEqual(["DEMO 218 scheduled arrival"]);
  });
});
