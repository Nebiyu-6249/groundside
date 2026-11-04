// A2 receipt reading (SPEC 8.2): output schema for strict structured output, and the Zod schema
// that validates it. The model reads what is printed; it never decides or approves anything.

import { z } from "zod";

export const RECEIPT_CATEGORIES = ["FOOD", "NON_ALCOHOLIC_DRINK", "ALCOHOL", "TOBACCO", "DUTY_FREE", "HOTEL", "TRANSPORT", "OTHER"] as const;
export const CONFIDENCE = ["LOW", "MEDIUM", "HIGH"] as const;

const amount = z.number().nonnegative().max(100_000).refine((n) => Math.round(n * 100) === Math.round(n * 1000) / 10, "at most 2 decimals");

export const a2OutputSchema = z.object({
  isReceipt: z.boolean(),
  merchantName: z.string().max(200).nullable(),
  merchantLocation: z.string().max(300).nullable(),
  isAtAirport: z.boolean().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  total: amount.nullable(),
  lineItems: z.array(z.object({ description: z.string().max(200), amount, category: z.enum(RECEIPT_CATEGORIES) })).max(60),
  language: z.string().max(40).nullable(),
  confidence: z.object({
    merchantName: z.enum(CONFIDENCE),
    date: z.enum(CONFIDENCE),
    time: z.enum(CONFIDENCE),
    currency: z.enum(CONFIDENCE),
    total: z.enum(CONFIDENCE),
    lineItems: z.enum(CONFIDENCE),
  }),
  legibilityNotes: z.string().max(400),
});

export type A2Output = z.infer<typeof a2OutputSchema>;

const nullable = (t: string) => ({ type: [t, "null"] });
const conf = { type: "string", enum: [...CONFIDENCE] };

export const a2JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isReceipt", "merchantName", "merchantLocation", "isAtAirport", "date", "time", "currency", "total", "lineItems", "language", "confidence", "legibilityNotes"],
  properties: {
    isReceipt: { type: "boolean" },
    merchantName: nullable("string"),
    merchantLocation: nullable("string"),
    isAtAirport: nullable("boolean"),
    date: { ...nullable("string"), description: "YYYY-MM-DD as printed" },
    time: { ...nullable("string"), description: "HH:MM, 24-hour, as printed" },
    currency: { ...nullable("string"), description: "ISO 4217 code" },
    total: nullable("number"),
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "amount", "category"],
        properties: { description: { type: "string" }, amount: { type: "number" }, category: { type: "string", enum: [...RECEIPT_CATEGORIES] } },
      },
    },
    language: nullable("string"),
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["merchantName", "date", "time", "currency", "total", "lineItems"],
      properties: { merchantName: conf, date: conf, time: conf, currency: conf, total: conf, lineItems: conf },
    },
    legibilityNotes: { type: "string" },
  },
} as const;
