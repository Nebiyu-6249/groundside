import { describe, expect, it } from "vitest";
import { fillNotice, validateA3 } from "@/lib/ai/a3/notice";
import { outcomeFor, renderNotice } from "@/lib/ops/notices";

const citable = new Set(["REG-7-1", "REG-9-1", "REG-5-3"]);
const approved = "Dear {{PASSENGER_NAME}},\n\nYour flight was cancelled. You will receive {{COMPENSATION_AMOUNT}}. Open {{CLAIM_LINK}} to choose how to be paid.";

describe("A3 notice validation (SPEC 8.3)", () => {
  it("accepts a notice with the required placeholders and no amounts", () => {
    expect(validateA3({ text: approved, citations: ["REG-7-1"] }, { outcome: "COMPENSATION_APPROVED", citable }).ok).toBe(true);
  });
  it("rejects a missing required placeholder", () => {
    const v = validateA3({ text: approved.replace("{{COMPENSATION_AMOUNT}}", "compensation"), citations: [] }, { outcome: "COMPENSATION_APPROVED", citable });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain("missing placeholder {{COMPENSATION_AMOUNT}}");
  });
  it("rejects any amount written by the model", () => {
    const v = validateA3({ text: `${approved} That is 600 EUR.`, citations: [] }, { outcome: "COMPENSATION_APPROVED", citable });
    expect(v.ok).toBe(false);
  });
  it("rejects placeholders that do not belong to the outcome and citations outside the rule list", () => {
    expect(validateA3({ text: `${approved} {{DECISION_REASON}}`, citations: [] }, { outcome: "COMPENSATION_APPROVED", citable }).ok).toBe(false);
    expect(validateA3({ text: approved, citations: ["REG-99"] }, { outcome: "COMPENSATION_APPROVED", citable }).ok).toBe(false);
  });
  it("requires a denial notice to say how to contest it", () => {
    const denial = "Dear {{PASSENGER_NAME}},\n\nCompensation is not being paid. The reason: {{DECISION_REASON}} Meals are still provided. See {{CLAIM_LINK}}.";
    expect(validateA3({ text: denial, citations: [] }, { outcome: "COMPENSATION_DENIED_WITH_CARE", citable }).ok).toBe(false);
    expect(validateA3({ text: `${denial} You may contest this with the national enforcement body in the country of departure.`, citations: [] }, { outcome: "COMPENSATION_DENIED_WITH_CARE", citable }).ok).toBe(true);
  });
});

describe("notice filling", () => {
  it("fills placeholders from code and drops unknown ones", () => {
    expect(fillNotice("Hi {{PASSENGER_NAME}} {{UNKNOWN}}", { PASSENGER_NAME: "Ana" })).toBe("Hi Ana ");
    expect(renderNotice(approved, { name: "Ana Ruiz", compensationCents: 60000, mealCents: 6000, link: "https://x/p/t", decisionReason: null })).toContain("You will receive 600.00 EUR.");
  });
  it("picks the outcome from the decision and the compensation owed", () => {
    expect(outcomeFor("DENY_COMPENSATION", 60000)).toBe("COMPENSATION_DENIED_WITH_CARE");
    expect(outcomeFor("APPROVE_COMPENSATION", 60000)).toBe("COMPENSATION_APPROVED");
    expect(outcomeFor("APPROVE_COMPENSATION", 0)).toBe("CARE_ONLY");
  });
});
