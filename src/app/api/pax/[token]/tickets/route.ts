import { getDb } from "@/lib/db";
import { offerByToken } from "@/lib/pax/offer";
import { talkToPerson } from "@/lib/pax/questions";
import { hit } from "@/lib/rate-limit";
import { ipHash } from "@/lib/request";

// "Talk to a person": opens one ticket per passenger in the ops console (SPEC F13).
export async function POST(request: Request, ctx: RouteContext<"/api/pax/[token]/tickets">) {
  const db = getDb();
  const limit = await hit(db, `ticket:${await ipHash()}`, 20, 3600);
  if (!limit.allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const { token } = await ctx.params;
  const view = await offerByToken(db, token);
  if (!view) return Response.json({ error: "This link is not valid or has expired." }, { status: 404 });
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const r = await talkToPerson(db, view.passengerId, typeof reason === "string" ? reason : "");
  return Response.json({ created: r.created });
}
