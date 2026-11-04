import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hammingDistance, NEAR_DUPLICATE_DISTANCE, processReceiptImage, ReceiptImageError } from "@/lib/receipts/image";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures", "receipts-synthetic", `${name}.png`));

describe("receipt image processing (SPEC F11)", () => {
  it("re-encodes as JPEG within 1600 px and strips metadata", async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#ffffff" } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Make: "TestCam", Artist: "Somebody" } } })
      .toBuffer();
    expect((await sharp(big).metadata()).exif).toBeDefined();
    const out = await processReceiptImage(big, "image/jpeg");
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(out.width, out.height)).toBe(1600);
    expect(meta.exif).toBeUndefined();
  });

  it("keeps a re-encoded copy within the near-duplicate distance, with a different SHA-256", async () => {
    // Different receipts printed from one template can also be this close; the checks therefore
    // also require the same total or time (tests/receipts/checks.test.ts).
    const a = await processReceiptImage(fixture("airport-cafe"), "image/png");
    const copy = await sharp(fixture("airport-cafe")).resize(450).jpeg({ quality: 60 }).toBuffer();
    const b = await processReceiptImage(copy, "image/jpeg");
    expect(a.sha256).not.toBe(b.sha256);
    expect(hammingDistance(a.dHash, b.dHash)).toBeLessThanOrEqual(NEAR_DUPLICATE_DISTANCE);
  });

  it("refuses other file types, empty files and files over 8 MB", async () => {
    await expect(processReceiptImage(Buffer.from("not an image"), "image/png")).rejects.toBeInstanceOf(ReceiptImageError);
    await expect(processReceiptImage(Buffer.from("%PDF-1.7"), "application/pdf")).rejects.toThrow("JPG, PNG or WebP");
    await expect(processReceiptImage(Buffer.alloc(0), "image/jpeg")).rejects.toThrow("empty");
    await expect(processReceiptImage(Buffer.alloc(8 * 1024 * 1024 + 1), "image/jpeg")).rejects.toThrow("8 MB");
  });
});
