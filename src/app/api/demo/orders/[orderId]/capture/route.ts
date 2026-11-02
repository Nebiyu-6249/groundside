import { captureDemoOrder } from "@/lib/demo/booking";
import { errorResponse } from "@/lib/demo/respond";

export async function POST(_req: Request, ctx: RouteContext<"/api/demo/orders/[orderId]/capture">) {
  try {
    const { orderId } = await ctx.params;
    return Response.json(await captureDemoOrder(orderId));
  } catch (err) {
    return errorResponse(err);
  }
}
