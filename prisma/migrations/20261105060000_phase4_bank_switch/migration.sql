-- A passenger with an unclaimed PayPal payout can ask to switch to bank transfer (SPEC F10, 9.7).
-- The switch completes only once the unclaimed item is cancelled or returned.
ALTER TABLE "Offer" ADD COLUMN "bankSwitchRequestedAt" TIMESTAMP(3);
