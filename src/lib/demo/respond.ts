import { PaypalConfigError } from "@/lib/paypal/config";
import { PaypalNetworkError } from "@/lib/paypal/http";
import { PaypalAuthError } from "@/lib/paypal/token";
import { DemoBookingError } from "./booking";

// Maps errors to short JSON answers. Never returns stack traces (golden rule 12).
export function errorResponse(err: unknown): Response {
  if (err instanceof DemoBookingError) {
    return Response.json({ error: err.message, debugId: err.debugId }, { status: err.httpStatus });
  }
  if (err instanceof PaypalConfigError) {
    return Response.json({ error: "PayPal is not configured on this server" }, { status: 503 });
  }
  if (err instanceof PaypalAuthError || err instanceof PaypalNetworkError) {
    return Response.json({ error: "PayPal could not be reached. Try again." }, { status: 502 });
  }
  console.error(JSON.stringify({ evt: "demo_error", message: err instanceof Error ? err.message : "unknown" }));
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
