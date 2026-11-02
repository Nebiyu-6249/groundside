import { refundDemoBooking } from "@/lib/demo/booking";
import { errorResponse } from "@/lib/demo/respond";

export async function POST(_req: Request, ctx: RouteContext<"/api/demo/bookings/[bookingId]/refund">) {
  try {
    const { bookingId } = await ctx.params;
    const refund = await refundDemoBooking(bookingId);
    return Response.json({ id: refund.id, status: refund.status, paypalRefundId: refund.paypalRefundId });
  } catch (err) {
    return errorResponse(err);
  }
}
