// Receipt image processing (SPEC F11): accept JPG, PNG or WebP up to 8 MB, turn it upright,
// resize to at most 1600 px on the long side and re-encode as JPEG. Re-encoding drops all
// metadata (EXIF, GPS, camera). Exact duplicates are found by SHA-256 of the uploaded bytes,
// near duplicates by a 64-bit difference hash (dHash) of the picture.

import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/**
 * dHash distance at or below which two photos may show the same receipt. Re-encoding a receipt
 * moved it by up to 9 bits in tests; the checks also require the same total or time.
 */
export const NEAR_DUPLICATE_DISTANCE = 10;

export class ReceiptImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptImageError";
  }
}

export interface ProcessedImage {
  jpeg: Buffer;
  sha256: string;
  dHash: string;
  width: number;
  height: number;
}

export async function processReceiptImage(bytes: Buffer, mimeType: string): Promise<ProcessedImage> {
  if (!ACCEPTED_TYPES.includes(mimeType as (typeof ACCEPTED_TYPES)[number])) throw new ReceiptImageError("Upload a JPG, PNG or WebP photo.");
  if (bytes.length === 0) throw new ReceiptImageError("The file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ReceiptImageError("The photo is larger than 8 MB.");
  let meta;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw new ReceiptImageError("This file is not a readable image.");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new ReceiptImageError("Upload a JPG, PNG or WebP photo.");
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, sha256: createHash("sha256").update(bytes).digest("hex"), dHash: await dHash(data), width: info.width, height: info.height };
}

/** Difference hash: 9x8 greyscale, one bit per horizontal neighbour comparison, as 16 hex digits. */
export async function dHash(image: Buffer): Promise<string> {
  const px = await sharp(image).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  // BigInt() rather than literals: the TypeScript target is below ES2020.
  const ONE = BigInt(1);
  let bits = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << ONE) | (px[y * 9 + x] > px[y * 9 + x + 1] ? ONE : BigInt(0));
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  const ONE = BigInt(1);
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & ONE);
    x >>= ONE;
  }
  return n;
}
