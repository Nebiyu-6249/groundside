// Weather windows per airport (docs/SPEC.md 7.3).

export interface WindowInput {
  origin: string;
  destination: string;
  schedDep: Date;
  schedArr: Date;
  actualDep?: Date | null;
  /** Cancellations: when the cancellation was announced. */
  cancelledAt?: Date | null;
  previous?: { origin: string; destination: string; schedDep: Date; schedArr: Date } | null;
}

export type WindowRole = "DEPARTURE" | "ARRIVAL" | "PREV_DEPARTURE" | "PREV_ARRIVAL";

export interface WeatherWindow {
  icao: string;
  role: WindowRole;
  from: Date;
  to: Date;
}

const H = 3_600_000;
const plus = (d: Date, hours: number) => new Date(d.getTime() + hours * H);
const latest = (...ds: (Date | null | undefined)[]) => new Date(Math.max(...ds.filter((d): d is Date => !!d).map((d) => d.getTime())));

export function weatherWindows(w: WindowInput): WeatherWindow[] {
  const windows: WeatherWindow[] = [
    { icao: w.origin, role: "DEPARTURE", from: plus(w.schedDep, -3), to: plus(latest(w.schedDep, w.actualDep, w.cancelledAt), 2) },
    { icao: w.destination, role: "ARRIVAL", from: plus(w.schedArr, -2), to: plus(w.schedArr, 2) },
  ];
  if (w.previous) {
    windows.push({ icao: w.previous.origin, role: "PREV_DEPARTURE", from: plus(w.previous.schedDep, -2), to: plus(w.previous.schedDep, 2) });
    windows.push({ icao: w.previous.destination, role: "PREV_ARRIVAL", from: plus(w.previous.schedArr, -2), to: plus(w.previous.schedArr, 2) });
  }
  return windows;
}

/** One fetch range per airport: the union of its windows. */
export function fetchRanges(windows: readonly WeatherWindow[]): { icao: string; from: Date; to: Date; roles: WindowRole[] }[] {
  const byIcao = new Map<string, { icao: string; from: Date; to: Date; roles: WindowRole[] }>();
  for (const w of windows) {
    const r = byIcao.get(w.icao);
    if (!r) byIcao.set(w.icao, { icao: w.icao, from: w.from, to: w.to, roles: [w.role] });
    else {
      r.from = new Date(Math.min(r.from.getTime(), w.from.getTime()));
      r.to = new Date(Math.max(r.to.getTime(), w.to.getTime()));
      r.roles.push(w.role);
    }
  }
  return [...byIcao.values()];
}
