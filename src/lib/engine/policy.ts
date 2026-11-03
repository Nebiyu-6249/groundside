// Demo Air policy (docs/SPEC.md 5.7). Policy, not law: every trace step that uses it cites a
// POL-* rule so the UI labels it "Demo Air policy".

import { z } from "zod";

export const airlinePolicySchema = z.strictObject({
  label: z.string(),
  currency: z.literal("EUR"),
  mealAllowanceFirstEur: z.number().int().nonnegative(),
  mealAllowanceEachFurtherHoursEur: z.number().int().nonnegative(),
  mealAllowanceFurtherEveryHours: z.number().int().positive(),
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
