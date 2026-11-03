// Fetches official EU texts from the Publications Office CELLAR service and turns them into
// plain text for excerpt checks. EUR-Lex itself answers scripted requests with a bot challenge,
// so the rule pack is verified against CELLAR, which serves the same Official Journal documents.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CACHE_DIR = path.join(process.cwd(), "scripts", "out", "legal");

export function cellarUrl(celex: string): string {
  return `http://publications.europa.eu/resource/celex/${encodeURIComponent(celex)}`;
}

/** HTML to whitespace-normalised text. Excerpts are compared after the same normalisation. */
export function htmlToText(html: string): string {
  return normalise(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|td|h\d|li|dt|dd|table)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
      .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCharCode(parseInt(n, 16))),
  );
}

export function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fetchCellar(url: string, depth = 0): Promise<string> {
  for (const accept of ["application/xhtml+xml", "text/html"]) {
    const res = await fetch(url, { headers: { Accept: accept, "Accept-Language": "eng" }, redirect: "follow" });
    const body = await res.text();
    if (res.status === 200) return body;
    if (res.status === 300 && depth < 2) {
      // Several manifestations: follow the first document link.
      const next = body.match(/href="(http:\/\/publications\.europa\.eu\/resource\/cellar\/[^"]+\/DOC_\d+)"/);
      if (next) return fetchCellar(next[1], depth + 1);
    }
  }
  throw new Error(`CELLAR returned no document for ${url}`);
}

/** Official text for a CELEX number, cached under scripts/out/legal (git-ignored). */
export async function officialText(celex: string, opts: { refresh?: boolean } = {}): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${celex.replace(/[^A-Za-z0-9]/g, "_")}.txt`);
  if (!opts.refresh && existsSync(file)) return readFileSync(file, "utf8");
  const text = htmlToText(await fetchCellar(cellarUrl(celex)));
  writeFileSync(file, text);
  return text;
}
