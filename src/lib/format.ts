// Display helpers. Times are stored in UTC and shown in airport local time with the zone name.

export function localTime(iso: string, tz: string, opts: { date?: boolean } = { date: true }): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    ...(opts.date ? { day: "2-digit", month: "short", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function utcTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export const euros = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

export const KIND_LABEL: Record<string, string> = {
  COMPENSATION: "Compensation",
  MEAL_ALLOWANCE: "Meals",
  HOTEL_REIMBURSEMENT_CAP: "Hotel (cap)",
  TRANSPORT_REIMBURSEMENT_CAP: "Transport (cap)",
  REFUND: "Refund",
};
