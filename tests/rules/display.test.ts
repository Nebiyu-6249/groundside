import { describe, expect, it } from "vitest";
import { loadRulePack } from "@/lib/rules/pack";
import { displayTitle } from "@/lib/rules/display";

const AIRLINES = /Ryanair|KLM|Air France|TUIfly|SAS|Germanwings|TAP|Transportes|Travel Service|flightright|Myflyright|Airhelp/;

describe("rule titles on screen (golden rule 10)", () => {
  it("shows case law by case number and date, without party names", () => {
    expect(displayTitle({ kind: "CASE_LAW", title: "McDonagh v Ryanair (Case C-12/11), 31 January 2013" })).toBe("Case C-12/11, 31 January 2013");
    expect(displayTitle({ kind: "CASE_LAW", title: "Sturgeon and Others (Joined Cases C-402/07 and C-432/07), 19 November 2009" })).toBe("Joined Cases C-402/07 and C-432/07, 19 November 2009");
    expect(displayTitle({ kind: "LAW", title: "Article 7(1)" })).toBe("Article 7(1)");
  });
  it("leaves no airline name in any displayed rule title or summary", () => {
    for (const r of loadRulePack()) {
      expect(displayTitle(r), r.id).not.toMatch(AIRLINES);
      expect(r.summary, r.id).not.toMatch(AIRLINES);
    }
  });
});
