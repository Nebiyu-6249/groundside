"use client";

import { AgCharts } from "ag-charts-react";
import { AllCommunityModule, ModuleRegistry, type AgCartesianChartOptions } from "ag-charts-community";
import type { AirportTimeline } from "@/lib/weather/timeline";

ModuleRegistry.registerModules([AllCommunityModule]);

const REFERENCE = "reference only, not operating minima";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Axis labels in UTC: the chart library would otherwise use the viewer's time zone. */
function utcLabel(value: unknown): string {
  const d = new Date(value as number | Date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** AG Charts weather timeline for one airport (SPEC 7.5). */
export function WeatherChart({ timeline, title, dark = true }: { timeline: AirportTimeline; title: string; dark?: boolean }) {
  const markers = [...timeline.markers].sort((a, b) => a.t - b.t);
  const options: AgCartesianChartOptions = {
    theme: dark ? "ag-default-dark" : "ag-default",
    background: { visible: false },
    height: 300,
    title: { text: title, fontSize: 14 },
    data: timeline.points.map((p) => ({ t: new Date(p.t), visibility: p.visibilityM, rvr: p.rvrM, ceiling: p.ceilingFt, raw: p.raw })),
    series: [
      { type: "line", xKey: "t", yKey: "visibility", yName: "Visibility (m)", marker: { size: 4 } },
      { type: "line", xKey: "t", yKey: "rvr", yName: "Lowest RVR (m)", marker: { size: 4 }, lineDash: [4, 3] },
      { type: "line", xKey: "t", yKey: "ceiling", yName: "Ceiling (ft)", yKeyAxis: "ceiling", marker: { size: 4 } },
    ],
    axes: {
      x: {
        type: "time",
        position: "bottom",
        label: { formatter: ({ value }) => utcLabel(value), fontSize: 10 },
        interval: { minSpacing: 70 },
        title: { text: "UTC" },
        // Short labels (letters keyed in the list below the chart) so close markers stay legible.
        crossLines: markers.map((m, i) => ({ type: "line" as const, value: new Date(m.t), stroke: "#c98a1c", lineDash: [2, 2], label: { text: String.fromCharCode(65 + i), position: "top" as const, fontSize: 11 } })),
      },
      y: {
        type: "number",
        position: "left",
        title: { text: "Visibility and RVR (m)" },
        min: 0,
        max: 10000,
        crossLines: [{ type: "line", value: 550, stroke: "#9aa4b2", lineDash: [6, 4], label: { text: "550 m", position: "inside-top-left", fontSize: 10 } }],
      },
      ceiling: {
        type: "number",
        position: "right",
        title: { text: "Ceiling (ft)" },
        min: 0,
        crossLines: [{ type: "line", value: 200, stroke: "#9aa4b2", lineDash: [1, 3], label: { text: "200 ft", position: "inside-top-right", fontSize: 10 } }],
      },
    },
    legend: { position: "bottom" },
  };
  return (
    <figure>
      <AgCharts options={options} />
      {markers.length ? (
        <ul className="mt-1 flex flex-wrap gap-x-4 text-xs">
          {markers.map((m, i) => <li key={i}><span className="font-mono font-semibold">{String.fromCharCode(65 + i)}</span> {m.label}, {new Date(m.t).toISOString().slice(11, 16)} UTC</li>)}
        </ul>
      ) : null}
      <figcaption className="mt-1 text-xs text-muted">
        Real archived observations (METAR). Visibility of 10 km or more is drawn at 10000 m. No ceiling point means no broken or overcast layer was reported. The 550 m and 200 ft lines are {REFERENCE}.
      </figcaption>
    </figure>
  );
}
