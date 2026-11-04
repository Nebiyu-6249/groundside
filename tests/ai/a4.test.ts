import { describe, expect, it } from "vitest";
import { moneyInText, validateA4 } from "@/lib/ai/a4/answer";

const ctx = { citable: new Set(["REG-7-1", "REG-9-1"]), amountsCents: [60000, 6000, 18900] };
const ok = (answer: string, extra: Record<string, unknown> = {}) => validateA4({ answer, citations: [], offerHuman: false, category: "CASE", ...extra }, ctx);

describe("A4 money in text", () => {
  it("reads amounts written in the usual ways", () => {
    expect(moneyInText("You get 600 euros and EUR 60.00, plus 15 € and €189.")).toEqual([60000, 6000, 1500, 18900]);
    expect(moneyInText("A refund of 1,234.50 EUR")).toEqual([123450]);
    expect(moneyInText("Distance 4844 km, delay 3 hours")).toEqual([]);
  });
});

describe("A4 validation (SPEC 8.4)", () => {
  it("accepts an answer whose amounts all come from the case file", () => {
    expect(ok("Your compensation is 600 euros and your meal allowance 60.00 EUR.").ok).toBe(true);
  });
  it("rejects an amount that is not in the case file", () => {
    const v = ok("You will receive 1000 euros.");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toContain("1000.00 EUR");
  });
  it("rejects a citation outside the rules list", () => {
    expect(ok("See the rule.", { citations: ["REG-99-1"] }).ok).toBe(false);
    expect(ok("See the rule.", { citations: ["REG-7-1"] }).ok).toBe(true);
  });
  it("always offers a person for legal advice, disputes and requests for a human", () => {
    for (const category of ["LEGAL_ADVICE", "DISPUTE", "WANTS_HUMAN"]) {
      const v = ok("A person can help with that.", { category });
      expect(v.ok && v.output.offerHuman).toBe(true);
    }
  });
  it("strips emoji and rejects answers that are far too long", () => {
    const v = ok("Your meal allowance is 60.00 EUR \u{1F600}");
    expect(v.ok && v.output.answer).toBe("Your meal allowance is 60.00 EUR");
    expect(ok(Array.from({ length: 150 }, () => "word").join(" ")).ok).toBe(false);
  });
});
