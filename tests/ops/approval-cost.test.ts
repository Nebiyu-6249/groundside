// Large approvals need a typed cost (src/lib/ops/approval-cost.ts).

import { describe, expect, it } from "vitest";
import { approvalCostCents, costConfirmationPhrase } from "@/lib/ops/approval-cost";

const e = (kind: string, amountCents: number, status = "READY") => ({ kind, amountCents, status });

describe("approval cost confirmation", () => {
  it("counts compensation, meals and the hotel and transport caps, not what is not owed", () => {
    expect(approvalCostCents([e("COMPENSATION", 60000), e("MEAL_ALLOWANCE", 1500), e("HOTEL_REIMBURSEMENT_CAP", 16000), e("TRANSPORT_REIMBURSEMENT_CAP", 8000), e("COMPENSATION", 60000, "NOT_OWED"), e("REFUND", 30000)])).toBe(85500);
  });
  it("asks nothing when the approval fits in one day's cap (the 12-passenger quick run)", () => {
    expect(costConfirmationPhrase(961500, 1_200_000)).toBeNull();
    expect(costConfirmationPhrase(1_200_000, 1_200_000)).toBeNull();
  });
  it("asks for the cost in whole euros, rounded up, above the cap (the 180-passenger full run)", () => {
    expect(costConfirmationPhrase(10_861_550, 1_200_000)).toBe("PAY 108616 EUR");
  });
});
