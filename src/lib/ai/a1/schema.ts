// A1 cause assessment output (docs/SPEC.md 8.1): Zod for validation, JSON schema for the
// strict structured-output request. Keep the two in step.

import { z } from "zod";

export const CAUSE_CATEGORIES = [
  "WEATHER", "TECHNICAL", "ATC", "STRIKE_OWN_STAFF", "STRIKE_THIRD_PARTY", "SECURITY", "BIRD_STRIKE",
  "DISRUPTIVE_PASSENGER", "CREW_AVAILABILITY", "AIRPORT_INFRASTRUCTURE", "OTHER", "NOT_STATED",
] as const;
export const CAUSE_LOCATIONS = ["DEPARTURE", "ARRIVAL", "PREVIOUS_FLIGHT", "EN_ROUTE", "UNKNOWN"] as const;
export const RECOMMENDATIONS = ["PAY_COMPENSATION", "NO_COMPENSATION_HUMAN_MUST_DECIDE", "UNCERTAIN_HUMAN_MUST_DECIDE"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const a1OutputSchema = z.strictObject({
  statedCause: z.strictObject({ category: z.enum(CAUSE_CATEGORIES), location: z.enum(CAUSE_LOCATIONS), quote: z.string() }),
  findings: z.array(
    z.strictObject({
      statement: z.string().min(1),
      effect: z.enum(["SUPPORTS_STATED_CAUSE", "CONTRADICTS_STATED_CAUSE", "NEUTRAL"]),
      factIds: z.array(z.string()),
      evidenceQuotes: z.array(z.string()),
    }),
  ),
  likelyCause: z.strictObject({ category: z.enum(CAUSE_CATEGORIES), location: z.enum(CAUSE_LOCATIONS), confidence: z.enum(["LOW", "MEDIUM", "HIGH"]) }),
  claimSupport: z.enum(["SUPPORTED", "NOT_SUPPORTED", "INSUFFICIENT_EVIDENCE"]),
  extraordinaryAssessment: z.enum(["LIKELY_EXTRAORDINARY", "LIKELY_NOT_EXTRAORDINARY", "UNCLEAR"]),
  knockOnFromPreviousFlight: z.boolean(),
  reasonableMeasuresNote: z.string(),
  modelRecommendation: z.enum(RECOMMENDATIONS),
  citations: z.array(z.string()),
  questionsForDutyManager: z.array(z.string()),
  summary: z.string(),
});

export type A1Output = z.infer<typeof a1OutputSchema>;

const str = { type: "string" };
const enumOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

export const a1JsonSchema = obj({
  statedCause: obj({ category: enumOf(CAUSE_CATEGORIES), location: enumOf(CAUSE_LOCATIONS), quote: str }),
  findings: {
    type: "array",
    items: obj({
      statement: str,
      effect: enumOf(["SUPPORTS_STATED_CAUSE", "CONTRADICTS_STATED_CAUSE", "NEUTRAL"]),
      factIds: { type: "array", items: str },
      evidenceQuotes: { type: "array", items: str },
    }),
  },
  likelyCause: obj({ category: enumOf(CAUSE_CATEGORIES), location: enumOf(CAUSE_LOCATIONS), confidence: enumOf(["LOW", "MEDIUM", "HIGH"]) }),
  claimSupport: enumOf(["SUPPORTED", "NOT_SUPPORTED", "INSUFFICIENT_EVIDENCE"]),
  extraordinaryAssessment: enumOf(["LIKELY_EXTRAORDINARY", "LIKELY_NOT_EXTRAORDINARY", "UNCLEAR"]),
  knockOnFromPreviousFlight: { type: "boolean" },
  reasonableMeasuresNote: str,
  modelRecommendation: enumOf(RECOMMENDATIONS),
  citations: { type: "array", items: str },
  questionsForDutyManager: { type: "array", items: str },
  summary: str,
});
