// Time helpers. All times are UTC Date objects; durations are whole minutes.

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

/** Calendar date (YYYY-MM-DD) of an instant in an IANA time zone. */
export function localDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Number of calendar days between two local dates (YYYY-MM-DD). */
export function daysBetweenLocalDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const iso = (d: Date) => d.toISOString();
