// Status for live refresh (SPEC 9.5): triggers throttled reconciliation while payouts are in
// flight, and returns a fingerprint that changes when anything the page shows has changed.

import { connection } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { reconcileDisruption } from "@/lib/payouts/reconcile";

export async function GET(_req: Request, ctx: RouteContext<"/api/disruptions/[id]/status">) {
  await connection();
  if (!(await currentUser())) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  const db = getDb();
  try {
    await reconcileDisruption(db, id);
  } catch {
    // PayPal unreachable: report the stored state; the next poll tries again.
  }
  const items = await db.payoutItem.findMany({ where: { entitlement: { passenger: { disruptionId: id } } }, select: { status: true, updatedAt: true } });
  const latest = items.reduce((m, i) => Math.max(m, i.updatedAt.getTime()), 0);
  const counts = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});
  return Response.json({ fingerprint: `${items.length}:${latest}`, counts });
}
