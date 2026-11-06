// Demo receipts a passenger page can submit without a photo of its own (judges, the video).
// All are synthetic samples made by code (scripts/make-receipts.ts and make-synthetic-receipts.ts);
// none is a real receipt. A sidecar may still set demoDateOverride (SPEC 8.2), labelled in the UI;
// the current samples carry their scenarios' real dates and need none. Uploads never get one.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface DemoReceipt {
  key: string;
  label: string;
  file: string;
  mimeType: string;
  synthetic: boolean;
  demoDateOverride: string | null;
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export function listDemoReceipts(): DemoReceipt[] {
  const out: DemoReceipt[] = [];
  // The photo-style samples (fixtures/receipts) when they exist; the plain test images otherwise.
  const sources = existsSync(path.join(process.cwd(), "fixtures", "receipts")) ? ([["receipts", true]] as const) : ([["receipts-synthetic", true]] as const);
  for (const [dir, synthetic] of sources) {
    const base = path.join(process.cwd(), "fixtures", dir);
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base).sort()) {
      const ext = path.extname(f).toLowerCase();
      if (!MIME[ext]) continue;
      const key = `${dir}/${path.basename(f, ext)}`;
      const sidecar = path.join(base, `${path.basename(f, ext)}.json`);
      const meta = existsSync(sidecar) ? (JSON.parse(readFileSync(sidecar, "utf8")) as { note?: string; label?: string; demoDateOverride?: string }) : {};
      out.push({ key, label: meta.label ?? `${synthetic ? "Synthetic" : "Demo"} receipt: ${meta.note ?? path.basename(f, ext)}`, file: path.join(base, f), mimeType: MIME[ext], synthetic, demoDateOverride: meta.demoDateOverride ?? null });
    }
  }
  return out;
}
