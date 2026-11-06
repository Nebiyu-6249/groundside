// Payout batches carry the PayPal app that made them, so a new sandbox app never syncs, re-sends
// or cancels an earlier app's payouts (src/lib/paypal/account.ts).

import { describe, expect, it } from "vitest";
import { paypalAccount } from "@/lib/paypal/account";

describe("paypalAccount", () => {
  it("is a stable 12-character fingerprint of the client ID", () => {
    const a = paypalAccount({ PAYPAL_CLIENT_ID: "client-a" });
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(paypalAccount({ PAYPAL_CLIENT_ID: "client-a" })).toBe(a);
  });
  it("differs between PayPal apps, so an earlier app's batches are left alone", () => {
    expect(paypalAccount({ PAYPAL_CLIENT_ID: "client-a" })).not.toBe(paypalAccount({ PAYPAL_CLIENT_ID: "client-b" }));
  });
  it("does not contain the client ID", () => {
    expect(paypalAccount({ PAYPAL_CLIENT_ID: "abcdef123456" })).not.toContain("abcdef");
  });
  it("refuses to run without a client ID", () => {
    expect(() => paypalAccount({})).toThrow("PAYPAL_CLIENT_ID");
  });
});
