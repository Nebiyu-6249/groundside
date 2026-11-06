-- Which PayPal sandbox app created each payout batch (a fingerprint of its client ID, not a secret).
-- Batches from an earlier app (NULL here) are archived: reconciliation, resends and unclaimed
-- cancels skip them, because the current credentials cannot read or change them.
ALTER TABLE "PayoutBatch" ADD COLUMN "paypalAccount" TEXT;
CREATE INDEX "PayoutBatch_paypalAccount_idx" ON "PayoutBatch"("paypalAccount");
