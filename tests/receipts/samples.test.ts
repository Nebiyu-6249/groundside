import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "fixtures", "receipts");
const jpgs = readdirSync(dir).filter((f) => f.endsWith(".jpg"));

describe("sample receipts (synthetic, scripts/make-receipts.ts)", () => {
  it("has the seven samples, each under 2 MB with no metadata", async () => {
    expect(jpgs).toHaveLength(7);
    for (const f of jpgs) {
      expect(statSync(path.join(dir, f)).size, f).toBeLessThan(2 * 1024 * 1024);
      const meta = await sharp(path.join(dir, f)).metadata();
      expect(meta.exif, f).toBeUndefined();
      expect(meta.xmp, f).toBeUndefined();
      expect(meta.iptc, f).toBeUndefined();
    }
  });

  it("labels every sample as synthetic, with expected values from the source", () => {
    for (const f of jpgs) {
      const side = JSON.parse(readFileSync(path.join(dir, f.replace(/\.jpg$/, ".json")), "utf8"));
      expect(side.synthetic, f).toBe(true);
      expect(side.label, f).toMatch(/^Sample receipt: /);
      expect(side.expected.total, f).toBeGreaterThan(0);
      expect(["AUTO_APPROVED", "HUMAN_REVIEW", "REJECTED"]).toContain(side.decision.expected);
    }
  });

  it("prints the sample footer and only zeroed identifiers in the generator", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts", "make-receipts.ts"), "utf8");
    expect(src).toContain("Sample receipt - Groundside demo");
    // Card numbers, tax IDs and phone numbers are zeros only.
    for (const m of src.matchAll(/\*\*\*\* (\d+)/g)) expect(m[1]).toMatch(/^0+$/);
    for (const m of src.matchAll(/(?:DE|P\. IVA |TRN )(\d{9,})/g)) expect(m[1]).toMatch(/^0+$/);
  });
});
