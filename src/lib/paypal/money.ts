// PayPal amounts are strings with two decimals. Groundside stores integer cents.

export function centsToAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`Amount in cents must be a non-negative integer, got ${cents}`);
  }
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${euros}.${rest.toString().padStart(2, "0")}`;
}

export function amountToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    throw new RangeError(`Not a PayPal amount: ${value}`);
  }
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return Number(match[1]) * 100 + Number(fraction);
}
