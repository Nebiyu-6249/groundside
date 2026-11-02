import { connection } from "next/server";
import { getDemoBooking } from "@/lib/demo/booking";
import { errorResponse } from "@/lib/demo/respond";

export async function GET(_req: Request, ctx: RouteContext<"/api/demo/bookings/[bookingId]">) {
  await connection();
  try {
    const { bookingId } = await ctx.params;
    return Response.json(await getDemoBooking(bookingId));
  } catch (err) {
    return errorResponse(err);
  }
}
