import { startDemoOrder } from "@/lib/demo/booking";
import { errorResponse } from "@/lib/demo/respond";

export async function POST() {
  try {
    return Response.json(await startDemoOrder());
  } catch (err) {
    return errorResponse(err);
  }
}
