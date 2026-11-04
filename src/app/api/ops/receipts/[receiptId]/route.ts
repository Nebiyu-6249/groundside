import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

// The processed receipt image for the ops review queue (signed-in staff only).
export async function GET(_req: Request, ctx: RouteContext<"/api/ops/receipts/[receiptId]">) {
  if (!(await currentUser())) return new Response("Not found", { status: 404 });
  const { receiptId } = await ctx.params;
  const r = await getDb().receipt.findUnique({ where: { id: receiptId }, select: { image: true } });
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(r.image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
