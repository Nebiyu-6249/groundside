import { getDb } from "@/lib/db";
import { processEvent, storeEvent } from "@/lib/paypal/webhook-store";
import { verifyWebhookSignature, webhookEventSchema } from "@/lib/paypal/webhooks";

// PayPal webhook receiver (docs/SPEC.md 9.4): verify, store once by event id, answer fast.
export async function POST(request: Request) {
  const raw = await request.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }
  const event = webhookEventSchema.safeParse(parsed);
  if (!event.success) {
    return Response.json({ error: "not a PayPal event" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyWebhookSignature(
      request.headers,
      parsed,
      process.env.PAYPAL_WEBHOOK_ID,
    );
  } catch {
    // PayPal unreachable: answer 503 so PayPal retries delivery later.
    return Response.json({ error: "verification unavailable" }, { status: 503 });
  }
  if (!verification.verified) {
    console.warn(
      JSON.stringify({
        evt: "webhook_rejected",
        eventId: event.data.id,
        eventType: event.data.event_type,
        reason: verification.reason,
        debugId: verification.debugId ?? null,
      }),
    );
    return Response.json({ error: "signature not verified" }, { status: 400 });
  }

  const db = getDb();
  const result = await storeEvent(db, event.data);
  if (result === "stored") {
    await processEvent(db, event.data);
  }
  console.info(
    JSON.stringify({
      evt: "webhook",
      eventId: event.data.id,
      eventType: event.data.event_type,
      result,
    }),
  );
  return Response.json({ received: true, duplicate: result === "duplicate" });
}
