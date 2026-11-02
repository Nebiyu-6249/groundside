import type { Metadata } from "next";
import { DEMO_FARE } from "@/lib/demo/fare";
import { BookingWidget } from "./booking-widget";

export const metadata: Metadata = { title: "Demo booking - Groundside" };

export default function DemoBookingPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
      <p className="text-sm text-muted">Demo data. Fictional airline. PayPal sandbox, no real money.</p>
      <h1 className="mt-2 text-2xl font-semibold">Book a demo seat</h1>

      <section className="mt-6 rounded border border-line bg-surface p-4">
        <p className="font-mono text-sm">{DEMO_FARE.flight}</p>
        <p className="mt-1">{DEMO_FARE.route}</p>
        <p className="mt-1 text-sm text-muted">Demo Air (fictional carrier), economy, one passenger</p>
        <p className="mt-3 font-mono text-xl tabular">
          {(DEMO_FARE.amountCents / 100).toFixed(2)} {DEMO_FARE.currency}
        </p>
      </section>

      <div className="mt-6">
        <BookingWidget clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID} />
      </div>

      <p className="mt-10 text-sm text-muted">
        Pay with a PayPal sandbox buyer account. After payment you can refund the booking in full;
        the refund goes back to the original PayPal payment through the Payments v2 API.
      </p>
    </main>
  );
}
