-- Receipt reimbursements are paid as their own payout items (SPEC F11). The "one active item per
-- entitlement" rule now covers entitlement payouts only; receipt payouts get one active item per
-- receipt, so a hotel cap can be paid on several receipts and a meal receipt can follow the
-- flat meal allowance.
DROP INDEX "PayoutItem_one_active_per_entitlement";
CREATE UNIQUE INDEX "PayoutItem_one_active_per_entitlement"
  ON "PayoutItem" ("entitlementId")
  WHERE "receiptId" IS NULL AND "status" NOT IN ('FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'CANCELED');
CREATE UNIQUE INDEX "PayoutItem_one_active_per_receipt"
  ON "PayoutItem" ("receiptId")
  WHERE "receiptId" IS NOT NULL AND "status" NOT IN ('FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'CANCELED');
