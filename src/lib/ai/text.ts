// Text checks shared by the AI validators.

/** Emoji and pictographs, plus the joiners and variation selectors that build them. */
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}‍️⃣]/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim();
}

export function hasEmoji(text: string): boolean {
  return new RegExp(EMOJI.source, "u").test(text);
}

export function normaliseForQuote(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** A digit next to EUR, euro(s) or the euro sign, in either order. */
const MONEY = /(\d[\d.,\s]*\s*(?:eur\b|euros?\b|€))|((?:\beur|\beuros?|€)\s*\d)/i;

export function containsMoney(text: string): boolean {
  return MONEY.test(text);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Wraps untrusted content in a delimited block; a closing tag inside the content is defused. */
export function dataBlock(name: string, content: string): string {
  const safe = content.replace(/<\/?data\b[^>]*>/gi, (m) => m.replace("<", "&lt;"));
  return `<data name="${name}">\n${safe}\n</data>`;
}

/** Applies a string transform to every string in a JSON value. */
export function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)])) as T;
  }
  return value;
}

export function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}
