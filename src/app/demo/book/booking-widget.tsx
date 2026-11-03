"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the parts of the PayPal JS SDK this page uses.
interface PaypalButtons {
  render(container: HTMLElement): Promise<void>;
  close?(): Promise<void>;
}
interface PaypalNamespace {
  Buttons(options: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: (data: { orderID: string }) => Promise<void> | void;
    onError?: (err: unknown) => void;
  }): PaypalButtons;
}
declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

interface RefundView {
  id: string;
  paypalRefundId: string | null;
  status: string;
  amountCents: number;
  lastError: string | null;
}
interface BookingView {
  id: string;
  pnr: string;
  totalCents: number;
  currency: string;
  orderStatus: string | null;
  captureId: string | null;
  refunds: RefundView[];
}

const SDK_ID = "paypal-js-sdk";
const FINAL_REFUND = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; debugId?: string };
  if (!res.ok) {
    const suffix = body.debugId ? ` (PayPal debug ID ${body.debugId})` : "";
    throw new Error(`${body.error ?? `Request failed (${res.status})`}${suffix}`);
  }
  return body;
}

function loadSdk(clientId: string): Promise<PaypalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  return new Promise((resolve, reject) => {
    let script = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SDK_ID;
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
        clientId,
      )}&currency=EUR&intent=capture&components=buttons`;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () =>
      window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK did not initialise")),
    );
    script.addEventListener("error", () => reject(new Error("PayPal SDK could not be loaded")));
  });
}

export function BookingWidget({ clientId }: { clientId: string | undefined }) {
  const buttonsRef = useRef<HTMLDivElement>(null);
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  const refreshBooking = useCallback(async (id: string) => {
    const res = await fetch(`/api/demo/bookings/${id}`, { cache: "no-store" });
    if (res.ok) setBooking((await res.json()) as BookingView);
  }, []);

  useEffect(() => {
    if (!clientId || booking) return;
    let buttons: PaypalButtons | null = null;
    let cancelled = false;
    loadSdk(clientId)
      .then((paypal) => {
        if (cancelled || !buttonsRef.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          createOrder: async () => {
            setError(null);
            const { orderId } = await postJson<{ orderId: string }>("/api/demo/orders");
            return orderId;
          },
          onApprove: async ({ orderID }) => {
            try {
              const { bookingId } = await postJson<{ bookingId: string }>(
                `/api/demo/orders/${encodeURIComponent(orderID)}/capture`,
              );
              await refreshBooking(bookingId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Payment capture failed");
            }
          },
          // The window can close with a cancel even though the buyer approved; the server
          // captures only if PayPal says the order is approved.
          onCancel: async ({ orderID }) => {
            try {
              const { bookingId } = await postJson<{ bookingId: string }>(
                `/api/demo/orders/${encodeURIComponent(orderID)}/capture`,
              );
              await refreshBooking(bookingId);
            } catch {
              setError("Payment cancelled. No money was taken.");
            }
          },
          onError: () => setError("PayPal reported an error. Try again."),
        });
        buttonsRef.current.innerHTML = "";
        return buttons.render(buttonsRef.current).then(() => setSdkReady(true));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "PayPal SDK failed"));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => undefined);
    };
  }, [clientId, booking, refreshBooking]);

  const latestRefund = booking?.refunds[0] ?? null;
  const refundInFlight = latestRefund !== null && !FINAL_REFUND.has(latestRefund.status);

  // Poll while a refund is in flight; the status route re-reads it from PayPal.
  useEffect(() => {
    if (!booking || !refundInFlight) return;
    const timer = setInterval(() => void refreshBooking(booking.id), 3000);
    return () => clearInterval(timer);
  }, [booking, refundInFlight, refreshBooking]);

  async function requestRefund() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/demo/bookings/${booking.id}/refund`);
      await refreshBooking(booking.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  if (!clientId) {
    return (
      <p role="alert" className="rounded border border-amber p-4 text-sm">
        PayPal is not configured on this server (NEXT_PUBLIC_PAYPAL_CLIENT_ID is missing).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!booking && (
        <div>
          {!sdkReady && !error && <p className="text-sm text-muted">Loading PayPal sandbox buttons...</p>}
          <div ref={buttonsRef} className="max-w-sm" />
        </div>
      )}

      {booking && (
        <section aria-labelledby="booking-heading" className="rounded border border-line bg-surface p-4">
          <h2 id="booking-heading" className="font-semibold">
            Booking <span className="font-mono">{booking.pnr}</span>
          </h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Paid</dt>
            <dd className="font-mono tabular">{euros(booking.totalCents)}</dd>
            <dt className="text-muted">Order status</dt>
            <dd className="font-mono">{booking.orderStatus ?? "-"}</dd>
            <dt className="text-muted">Capture ID</dt>
            <dd className="font-mono break-all">{booking.captureId ?? "-"}</dd>
            {latestRefund && (
              <>
                <dt className="text-muted">Refund</dt>
                <dd className="font-mono" aria-live="polite">
                  {latestRefund.status}
                  {latestRefund.paypalRefundId ? ` (${latestRefund.paypalRefundId})` : ""}
                </dd>
              </>
            )}
          </dl>
          {(!latestRefund || latestRefund.status === "FAILED") && booking.captureId && (
            <button
              type="button"
              onClick={requestRefund}
              disabled={busy}
              className="mt-4 rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              {busy ? "Requesting refund..." : "Refund this booking in full"}
            </button>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      )}
    </div>
  );
}
