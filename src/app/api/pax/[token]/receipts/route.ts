import { after } from "next/server";
import { getDb } from "@/lib/db";
import { offerByToken } from "@/lib/pax/offer";
import { payDisruption } from "@/lib/payouts/orchestrator";
import { hit } from "@/lib/rate-limit";
import { ReceiptImageError } from "@/lib/receipts/image";
import { ReceiptError, submitReceipt } from "@/lib/receipts/service";
import { ipHash } from "@/lib/request";

// Passenger receipt upload (SPEC F11). A route handler rather than a server action, so photos of
// up to 8 MB are accepted without raising the server-action body limit for every form.
export async function POST(request: Request, ctx: RouteContext<"/api/pax/[token]/receipts">) {
  const db = getDb();
  try {
    const limit = await hit(db, `receipt:${await ipHash()}`, 20, 3600);
    if (!limit.allowed) return Response.json({ error: "Too many uploads. Try again later." }, { status: 429 });
    const { token } = await ctx.params;
    const view = await offerByToken(db, token);
    if (!view) return Response.json({ error: "This link is not valid or has expired." }, { status: 404 });
    const form = await request.formData();
    const file = form.get("receipt");
    if (!(file instanceof File)) return Response.json({ error: "Choose a photo of your receipt." }, { status: 400 });
    const r = await submitReceipt(db, view.passengerId, { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type });
    if (r.decision === "AUTO_APPROVED") after(async () => void (await payDisruption(db, r.disruptionId)));
    return Response.json({ decision: r.decision, reason: r.reason });
  } catch (err) {
    if (err instanceof ReceiptError || err instanceof ReceiptImageError) return Response.json({ error: err.message }, { status: 400 });
    console.error(JSON.stringify({ evt: "receipt_error", message: err instanceof Error ? err.message : "unknown" }));
    return Response.json({ error: "The receipt could not be processed. Try again." }, { status: 500 });
  }
}
