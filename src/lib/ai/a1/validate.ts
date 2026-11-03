// A1 validators (docs/SPEC.md 8.1) and the code policy that decides the shown recommendation.
// Validation runs after emoji are stripped (golden rule 9).

import { allStrings, containsMoney, mapStrings, normaliseForQuote, stripEmoji, wordCount } from "../text";
import { a1OutputSchema, type A1Output, type Recommendation } from "./schema";

export interface A1Context {
  opsNote: string;
  maintenanceLog: string;
  /** Other ops documents supplied as evidence (for example an ATC notice). */
  otherEvidence: string[];
  factIds: ReadonlySet<string>;
  citable: ReadonlySet<string>;
}

export interface A1Validation {
  ok: boolean;
  errors: string[];
  emojiStripped: boolean;
  output: A1Output | null;
}

export function validateA1(raw: unknown, ctx: A1Context): A1Validation {
  const cleaned = mapStrings(raw, stripEmoji);
  const emojiStripped = JSON.stringify(cleaned) !== JSON.stringify(raw);
  const parsed = a1OutputSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 10).map((i) => `schema: ${i.path.join(".")}: ${i.message}`), emojiStripped, output: null };
  }
  const out = parsed.data;
  const errors: string[] = [];

  // 2. Citations must be VERIFIED rule-pack IDs.
  for (const id of out.citations) if (!ctx.citable.has(id)) errors.push(`citation ${id} is not a verified rule-pack ID`);

  // 3. Fact IDs must exist for this disruption.
  for (const f of out.findings) for (const id of f.factIds) if (!ctx.factIds.has(id)) errors.push(`fact ID ${id} does not exist`);

  // 4. Quotes must be verbatim (whitespace and case normalised).
  const sources = [ctx.opsNote, ctx.maintenanceLog, ...ctx.otherEvidence].map(normaliseForQuote);
  const isQuote = (q: string) => sources.some((s) => s.includes(normaliseForQuote(q)));
  if (out.statedCause.quote.trim() && !normaliseForQuote(ctx.opsNote).includes(normaliseForQuote(out.statedCause.quote))) {
    errors.push(`statedCause.quote is not verbatim from the ops note: "${out.statedCause.quote.slice(0, 80)}"`);
  }
  for (const f of out.findings) {
    for (const q of f.evidenceQuotes) {
      if (!isQuote(q)) errors.push(`evidence quote is not verbatim from the ops note, maintenance log or other evidence (weather facts go in factIds, never in evidenceQuotes): "${q.slice(0, 80)}"`);
    }
  }

  // 5. No money in any text field.
  for (const s of allStrings(out)) if (containsMoney(s)) errors.push(`text contains a currency amount: "${s.slice(0, 80)}"`);

  // 6. Summary length.
  if (wordCount(out.summary) > 80) errors.push(`summary has ${wordCount(out.summary)} words (limit 80)`);

  return { ok: errors.length === 0, errors, emojiStripped, output: out };
}

/** Code decides what is shown (SPEC 8.1 policy mapping); the model's own label is only logged. */
export function mapRecommendation(out: A1Output): Recommendation {
  const confident = out.likelyCause.confidence === "MEDIUM" || out.likelyCause.confidence === "HIGH";
  if (out.claimSupport === "SUPPORTED" && out.extraordinaryAssessment === "LIKELY_EXTRAORDINARY" && confident) return "NO_COMPENSATION_HUMAN_MUST_DECIDE";
  if (out.extraordinaryAssessment === "LIKELY_NOT_EXTRAORDINARY" && confident) return "PAY_COMPENSATION";
  return "UNCERTAIN_HUMAN_MUST_DECIDE";
}
