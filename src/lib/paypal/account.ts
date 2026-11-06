// A short fingerprint of the PayPal app in use (SHA-256 of the client ID, which is public anyway).
// Payout batches record it, so records made with an earlier app are never synced, re-sent or
// cancelled with credentials that cannot see them.

import { createHash } from "node:crypto";

export function paypalAccount(env: Record<string, string | undefined> = process.env): string {
  const id = env.PAYPAL_CLIENT_ID;
  if (!id) throw new Error("PAYPAL_CLIENT_ID is not set");
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}
