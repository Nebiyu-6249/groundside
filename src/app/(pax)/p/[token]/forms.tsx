"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { PaxState } from "./actions";

export function PaymentForm({ action, consentText }: { action: (prev: PaxState, form: FormData) => Promise<PaxState>; consentText: string }) {
  const [state, run, pending] = useActionState(action, { error: null });
  const [method, setMethod] = useState<"PAYPAL" | "BANK_TRANSFER">("PAYPAL");
  return (
    <form action={run} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="font-medium">How would you like to be paid?</legend>
        <label className="flex items-center gap-2"><input type="radio" name="method" value="PAYPAL" checked={method === "PAYPAL"} onChange={() => setMethod("PAYPAL")} /> PayPal, usually within minutes</label>
        <label className="flex items-center gap-2"><input type="radio" name="method" value="BANK_TRANSFER" checked={method === "BANK_TRANSFER"} onChange={() => setMethod("BANK_TRANSFER")} /> Bank transfer</label>
      </fieldset>
      {method === "PAYPAL" ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="paypalEmail" className="block text-sm">Email address of your PayPal account</label>
            <input id="paypalEmail" name="paypalEmail" type="email" required autoComplete="email" className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" value="yes" required className="mt-1" /> <span>{consentText}</span></label>
        </div>
      ) : (
        <div>
          <label htmlFor="ibanLast4" className="block text-sm">Last 4 characters of your IBAN (demo: we never ask for the full number)</label>
          <input id="ibanLast4" name="ibanLast4" required minLength={4} maxLength={4} autoComplete="off" className="mt-1 w-32 rounded border border-line bg-surface px-3 py-2 font-mono" />
        </div>
      )}
      {state.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{state.ok}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded bg-ink px-4 py-3 font-medium text-paper disabled:opacity-60">{pending ? "Saving" : "Confirm"}</button>
    </form>
  );
}

export function TravelForm({ action }: { action: (prev: PaxState, form: FormData) => Promise<PaxState> }) {
  const [state, run, pending] = useActionState(action, { error: null });
  return (
    <form action={run} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="font-medium">Your journey</legend>
        <label className="flex items-start gap-2"><input type="radio" name="travel" value="REROUTING" required className="mt-1" /> <span>Take the new flight we booked for you. Meals, hotel and transport are covered while you wait.</span></label>
        <label className="flex items-start gap-2"><input type="radio" name="travel" value="REFUND" className="mt-1" /> <span>Do not travel; refund my ticket within 7 days. Meals, hotel and transport stop once you choose this.</span></label>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="rounded border border-ink px-4 py-2 text-sm disabled:opacity-60">{pending ? "Saving" : "Save my choice"}</button>
    </form>
  );
}

/** Refreshes the page every 5 seconds while a payment is on its way (SPEC 9.5). */
export function PaxRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
