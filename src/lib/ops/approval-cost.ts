// A typed cost confirmation for large approvals (owner decision 2026-11-06). The 180-passenger
// full run pays over 100,000 EUR of sandbox money, so an approval that costs more than one day's
// payout cap needs the duty manager to type the cost. The 12-passenger quick run (judges, video)
// stays under the cap and is not affected.

const COST_KINDS = new Set(["COMPENSATION", "MEAL_ALLOWANCE", "HOTEL_REIMBURSEMENT_CAP", "TRANSPORT_REIMBURSEMENT_CAP"]);

export interface CostEntitlement {
  kind: string;
  amountCents: number;
  status: string;
}

/** Upper bound of what an approval can pay: compensation, meal allowances and the hotel and transport caps. */
export function approvalCostCents(entitlements: readonly CostEntitlement[]): number {
  return entitlements.filter((e) => COST_KINDS.has(e.kind) && e.amountCents > 0 && e.status !== "NOT_OWED").reduce((s, e) => s + e.amountCents, 0);
}

/** The phrase to type when the cost is above one day's payout cap, otherwise null. Whole euros, rounded up. */
export function costConfirmationPhrase(costCents: number, dailyCapCents: number): string | null {
  return costCents > dailyCapCents ? `PAY ${Math.ceil(costCents / 100)} EUR` : null;
}
