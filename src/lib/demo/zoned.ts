// Local wall-clock time in an IANA zone to a UTC Date, without a date library.

function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** `date` is YYYY-MM-DD, `time` is HH:MM, both local to `tz`; `dayOffset` shifts the local date. */
export function zonedToUtc(date: string, time: string, tz: string, dayOffset = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d + dayOffset, hh, mm);
  // Two passes settle the offset around DST changes.
  let guess = naive - offsetMinutes(new Date(naive), tz) * 60_000;
  guess = naive - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}
