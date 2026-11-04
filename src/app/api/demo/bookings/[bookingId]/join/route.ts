import { getDb } from "@/lib/db";
import { joinCancelledFlight } from "@/lib/demo/join";
import { errorResponse } from "@/lib/demo/respond";
import { hit } from "@/lib/rate-limit";
import { ipHash } from "@/lib/request";

// Adds a paid demo booking to the cancelled demo flight and returns the passenger page path.
export async function POST(_req: Request, ctx: RouteContext<"/api/demo/bookings/[bookingId]/join">) {
  try {
    const db = getDb();
    const limit = await hit(db, `join:${await ipHash()}`, 10, 3600);
    if (!limit.allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    const { bookingId } = await ctx.params;
    const { link } = await joinCancelledFlight(db, bookingId);
    return Response.json({ path: new URL(link).pathname });
  } catch (err) {
    return errorResponse(err);
  }
}
