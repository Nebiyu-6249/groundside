import { describe, expect, it } from "vitest";
import { duplicateBatchId, payoutSettings } from "@/lib/payouts/orchestrator";
import { batchTransitionAllowed, entitlementStatusFor, itemTransitionAllowed } from "@/lib/payouts/transitions";
import { validateDenial } from "@/lib/ops/decisions";

describe("payout state transitions never move backwards (SPEC 9.5)", () => {
  it("allows forward item moves and refuses backward ones", () => {
    expect(itemTransitionAllowed("CREATING", "PENDING")).toBe(true);
    expect(itemTransitionAllowed("PENDING", "SUCCESS")).toBe(true);
    expect(itemTransitionAllowed("PENDING", "UNCLAIMED")).toBe(true);
    expect(itemTransitionAllowed("UNCLAIMED", "RETURNED")).toBe(true);
    expect(itemTransitionAllowed("UNCLAIMED", "SUCCESS")).toBe(true);
    expect(itemTransitionAllowed("SUCCESS", "PENDING")).toBe(false);
    expect(itemTransitionAllowed("SUCCESS", "FAILED")).toBe(false);
    expect(itemTransitionAllowed("SUCCESS", "SUCCESS")).toBe(false);
    expect(itemTransitionAllowed("SUCCESS", "REVERSED")).toBe(true);
    expect(itemTransitionAllowed("PENDING", "SOMETHING_NEW")).toBe(false);
  });

  it("orders batch statuses", () => {
    expect(batchTransitionAllowed("CREATING", "PENDING")).toBe(true);
    expect(batchTransitionAllowed("PENDING", "PROCESSING")).toBe(true);
    expect(batchTransitionAllowed("PROCESSING", "SUCCESS")).toBe(true);
    expect(batchTransitionAllowed("SUCCESS", "PROCESSING")).toBe(false);
  });

  it("maps item statuses to entitlement statuses", () => {
    expect(entitlementStatusFor("SUCCESS")).toBe("PAID");
    expect(entitlementStatusFor("UNCLAIMED")).toBe("PAYING");
    expect(entitlementStatusFor("RETURNED")).toBe("ACCEPTED");
  });
});

describe("payout batch creation safety (SPEC 9.6)", () => {
  it("adopts the original batch from the duplicate sender_batch_id error recorded in Phase 0", () => {
    const phase0Error = {
      name: "USER_BUSINESS_ERROR",
      details: [{ field: "SENDER_BATCH_ID", location: "body", issue: "Batch with given sender_batch_id already exists", link: [{ href: "https://api.sandbox.paypal.com/v1/payments/payouts/JMFR29AWPY7T2", rel: "self", method: "GET" }] }],
    };
    expect(duplicateBatchId(phase0Error)).toBe("JMFR29AWPY7T2");
    expect(duplicateBatchId({ name: "VALIDATION_ERROR", details: [{ field: "items[0].receiver" }] })).toBeNull();
  });

  it("reads batch size and daily cap from env with safe defaults", () => {
    expect(payoutSettings({ PAYOUT_BATCH_SIZE: "20", PAYOUT_DAILY_CAP_EUR: "20000" })).toEqual({ batchSize: 20, dailyCapCents: 2_000_000 });
    expect(payoutSettings({ PAYOUT_BATCH_SIZE: "abc" }).batchSize).toBe(20);
  });
});

describe("signed denial (golden rule 2)", () => {
  const user = { id: "u1", email: "dm@demo.test", name: "Demo Duty Manager", role: "DUTY_MANAGER" as const };
  const citable = new Set(["REG-5-3", "REG-REC-14"]);

  it("accepts a typed name, a reason and verified citations", () => {
    expect(validateDenial(user, { typedName: "demo duty manager", reason: "Dense fog with RVR below minima at departure.", citations: ["REG-5-3", "REG-REC-14"] }, citable)).toEqual([]);
  });

  it("rejects a wrong name, a short reason, no citations and unknown citations", () => {
    expect(validateDenial(user, { typedName: "Someone", reason: "fog", citations: [] }, citable)).toHaveLength(3);
    expect(validateDenial(user, { typedName: "Demo Duty Manager", reason: "Dense fog with RVR below minima.", citations: ["POL-MEALS"] }, citable)[0]).toContain("POL-MEALS");
  });
});
