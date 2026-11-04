import { describe, expect, it } from "vitest";
import { refundEntitlementStatus, REFUND_DAYS } from "@/lib/ops/refunds";

describe("refund entitlement follows the PayPal refund (REG-8-1)", () => {
  it("is paid only when PayPal reports the refund completed", () => {
    expect(refundEntitlementStatus("COMPLETED")).toBe("PAID");
  });
  it("is in flight while PayPal processes it", () => {
    expect(refundEntitlementStatus("REQUESTED")).toBe("PAYING");
    expect(refundEntitlementStatus("PENDING")).toBe("PAYING");
  });
  it("is owed again after a failed or cancelled refund, so ops can retry", () => {
    expect(refundEntitlementStatus("FAILED")).toBe("READY");
    expect(refundEntitlementStatus("CANCELLED")).toBe("READY");
  });
  it("uses the seven-day deadline of Art 8(1)(a)", () => {
    expect(REFUND_DAYS).toBe(7);
  });
});
