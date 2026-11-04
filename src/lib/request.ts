// Request helpers for server code. IP addresses are only ever stored as salted hashes (SPEC 13).

import { createHash } from "node:crypto";
import { headers } from "next/headers";

export async function ipHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}
