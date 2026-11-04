// Fixed-window rate limit backed by the RateLimit table (docs/SPEC.md 13). One atomic upsert:
// a new window resets the count, the same window increments it.

import type { PrismaClient } from "@/generated/prisma/client";

export async function hit(db: PrismaClient, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "createdAt", "updatedAt")
    VALUES (${key}, 1, ${windowStart}, now(), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" = ${windowStart} THEN "RateLimit"."count" + 1 ELSE 1 END,
      "windowStart" = ${windowStart},
      "updatedAt" = now()
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? limit + 1);
  return { allowed: count <= limit, count };
}
