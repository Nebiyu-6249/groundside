// Demo Air policy (docs/SPEC.md 5.7). Policy, not law: every trace step that uses it cites a
// POL-* rule so the UI labels it "Demo Air policy".

import { z } from "zod";

export const airlinePolicySchema = z.strictObject({
  label: z.string(),
  currency: z.literal("EUR"),
  /** Paid at once when the care trigger is reached (owner decision 2026-11-06). */
  mealAllowanceFlatEur: z.number().int().nonnegative(),
  /** Meals in total per 24 hours of waiting, the flat allowance included; receipts cover the rest. */
  mealAllowanceMaxPer24hEur: z.number().int().nonnegative(),
  hotelCapPerNightEur: z.number().int().nonnegative(),
  groundTransportCapEachWayEur: z.number().int().nonnegative(),
  applyArt7_2Reduction: z.boolean(),
  receiptWindowBeforeSchedDepMinutes: z.number().int().nonnegative(),
  receiptWindowAfterNewDepMinutes: z.number().int().nonnegative(),
  receiptExcludedCategories: z.array(z.string()),
  fxRates: z.strictObject({
    label: z.string(),
    asOf: z.string(),
    toEur: z.record(z.string(), z.number().positive()),
  }),
});

export type AirlinePolicy = z.infer<typeof airlinePolicySchema>;
