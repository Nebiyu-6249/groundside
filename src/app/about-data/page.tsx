import type { Metadata } from "next";
import Link from "next/link";
import { WeatherChart } from "@/components/weather-chart";
import { loadAirports } from "@/lib/demo/seed";
import { loadScenario, resolveTimes, SCENARIO_KEYS } from "@/lib/demo/scenarios";
import { loadScenarioWeather } from "@/lib/weather/scenario";
import { airportTimeline } from "@/lib/weather/timeline";

export const metadata: Metadata = { title: "About the data - Groundside" };

const ROLE: Record<string, string> = { DEPARTURE: "departure", ARRIVAL: "arrival", PREV_DEPARTURE: "previous flight departure", PREV_ARRIVAL: "previous flight arrival" };

function scenarioCharts() {
  const airports = new Map(loadAirports().map((a) => [a.icao, a]));
  return SCENARIO_KEYS.map((key) => {
    const s = loadScenario(key);
    const t = resolveTimes(s, airports);
    const w = loadScenarioWeather(key);
    const flight = { number: s.flight.number, schedDep: t.schedDep, schedArr: t.schedArr, actualDep: null, previous: { number: s.previousFlight.number, schedDep: t.prevDep, schedArr: t.prevArr } };
    const timelines = w.evidence.map((e) => ({ e, timeline: airportTimeline({ airportIcao: e.icao, raw: e.raw, parsed: { roles: w.windows.filter((x) => x.icao === e.icao).map((x) => x.role) } }, flight)! }));
    return { key, title: s.title, date: s.dateLocal, flight: s.flight.number, timelines };
  });
}

export default function AboutDataPage() {
  const scenarios = scenarioCharts();
  return (
    <div data-theme="light" className="flex-1">
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="font-mono text-sm text-muted"><Link href="/" className="underline underline-offset-4">Groundside</Link> / about the data</p>
        <h1 className="mt-2 text-2xl font-semibold">What is real and what is not</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded border border-line bg-surface p-4">
            <h2 className="font-medium">Synthetic (demo data)</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>The airline: Demo Air (fictional carrier), its flight numbers, aircraft and ops notes.</li>
              <li>Passengers, bookings, names and email addresses.</li>
              <li>Meal, hotel and transport amounts: Demo Air policy, not set by law.</li>
              <li>Test receipts marked &quot;SYNTHETIC TEST RECEIPT&quot;.</li>
              <li>Money: PayPal sandbox only. No real money moves.</li>
            </ul>
          </section>
          <section className="rounded border border-line bg-surface p-4">
            <h2 className="font-medium">Real</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Weather: archived airport observations (METAR) from the <a className="underline underline-offset-4" href="https://mesonet.agron.iastate.edu/" rel="noreferrer" target="_blank">Iowa Environmental Mesonet</a> (Iowa State University), public domain. Forecasts (TAF) were not available for these dates.</li>
              <li>Airports, codes and coordinates: <a className="underline underline-offset-4" href="https://ourairports.com/data/" rel="noreferrer" target="_blank">OurAirports</a>, public domain.</li>
              <li>The law: EU Regulation 261/2004, CJEU judgments and the Commission&apos;s 2024 guidelines, each excerpt checked word for word against the official text from the EU Publications Office.</li>
            </ul>
          </section>
        </div>
        {scenarios.map((s) => (
          <section key={s.key} className="mt-10">
            <h2 className="text-lg font-medium">Scenario {s.key}: {s.title}</h2>
            <p className="text-sm text-muted">{s.flight} on {s.date} (local date at departure). Real weather, synthetic flight.</p>
            <div className="mt-3 grid gap-6 lg:grid-cols-2">
              {s.timelines.map(({ e, timeline }) => (
                <div key={e.id}>
                  <WeatherChart dark={false} timeline={timeline} title={`${e.icao}: ${timeline.roles.map((r) => ROLE[r] ?? r).join(", ")}`} />
                  <p className="mt-1 text-xs text-muted">{timeline.points.length} reports, retrieved {e.retrievedAt.slice(0, 10)}. <a className="underline underline-offset-4" href={e.sourceUrl} rel="noreferrer" target="_blank">Source query</a></p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
