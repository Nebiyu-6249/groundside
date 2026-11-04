import { getDb } from "@/lib/db";
import { offerByToken } from "@/lib/pax/offer";

// The processed receipt image (metadata stripped), only for the passenger who uploaded it.
export async function GET(_req: Request, ctx: RouteContext<"/api/pax/[token]/receipts/[receiptId]">) {
  const { token, receiptId } = await ctx.params;
  const db = getDb();
  const view = await offerByToken(db, token);
  if (!view) return new Response("Not found", { status: 404 });
  const r = await db.receipt.findFirst({ where: { id: receiptId, passengerId: view.passengerId }, select: { image: true } });
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(r.image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
