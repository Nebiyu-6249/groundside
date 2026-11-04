import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { getDb } from "@/lib/db";
import { euros, localTime } from "@/lib/format";
import { CONSENT_TEXT } from "@/lib/ops/passenger-choice";
import { offerByToken, type PassengerView } from "@/lib/pax/offer";
import { reconcileDisruption } from "@/lib/payouts/reconcile";
import { refreshRefunds } from "@/lib/ops/refunds";
import { chooseTravel, choosePayment, switchToBank } from "./actions";
import { BankSwitchForm, PaxRefresh, PaymentForm, TravelForm } from "./forms";
import { ReceiptUpload } from "./receipt-upload";
import { Questions } from "./questions";
import { listDemoReceipts } from "@/lib/receipts/fixtures";

export const metadata: Metadata = { title: "Your flight - Demo Air", robots: { index: false } };

const eurWords = (cents: number) => `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} euros`;

function Tracker({ v }: { v: PassengerView }) {
  // Only what is payable now: compensation waiting for the airline's decision is not tracked yet.
  const items = v.entitlements.filter((e) => (e.kind === "COMPENSATION" || e.kind === "MEAL_ALLOWANCE") && e.status !== "PENDING_DECISION" && e.amountCents > 0);
  const statuses = items.map((e) => e.payoutStatus);
  const sent = statuses.some((s) => s !== null);
  const done = statuses.length > 0 && statuses.every((s) => s === "SUCCESS" || s === null) && statuses.some((s) => s === "SUCCESS");
  const unclaimed = statuses.includes("UNCLAIMED");
  const steps = [
    { label: v.decision ? "Approved" : "Meal allowance released", done: v.decision !== null || v.careReleased },
    { label: "Sent to PayPal", done: sent },
    { label: unclaimed ? "Waiting: create a PayPal account with this email to collect it" : "In your PayPal account", done },
  ];
  return (
    <ol className="space-y-2" aria-label="Payment status">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2">
          {s.done ? <CheckCircle2 aria-hidden className="h-5 w-5 text-green" /> : i === steps.findIndex((x) => !x.done) ? <Clock aria-hidden className="h-5 w-5 text-amber" /> : <Circle aria-hidden className="h-5 w-5 text-muted" />}
          <span>{s.label}</span>
          <span className="sr-only">{s.done ? "done" : "not yet"}</span>
        </li>
      ))}
    </ol>
  );
}

async function PassengerPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const db = getDb();
  let v = await offerByToken(db, token);
  if (!v) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-xl font-semibold">This link is not valid</h1>
        <p className="mt-2">It may have expired or been mistyped. Contact Demo Air (fictional carrier) for a new link.</p>
      </main>
    );
  }
  const refundInFlight = v.refundStatus !== null && !["COMPLETED", "FAILED", "CANCELLED"].includes(v.refundStatus);
  const receiptInFlight = v.receipts.some((r) => r.payoutStatus && ["CREATING", "PENDING", "ONHOLD"].includes(r.payoutStatus));
  const inFlight = refundInFlight || receiptInFlight || v.entitlements.some((e) => e.payoutStatus && ["CREATING", "PENDING", "ONHOLD", "UNCLAIMED"].includes(e.payoutStatus));
  if (inFlight) {
    const disruptionId = v.disruptionId;
    try {
      await reconcileDisruption(db, disruptionId);
      if (refundInFlight) await refreshRefunds(db, disruptionId);
      v = (await offerByToken(db, token)) ?? v;
    } catch {
      // PayPal unreachable: show the stored state.
    }
  }
  const comp = v.entitlements.find((e) => e.kind === "COMPENSATION");
  const CARE_ORDER = ["MEAL_ALLOWANCE", "HOTEL_REIMBURSEMENT_CAP", "TRANSPORT_REIMBURSEMENT_CAP"];
  const care = v.entitlements.filter((e) => CARE_ORDER.includes(e.kind) && e.amountCents > 0).sort((a, b) => CARE_ORDER.indexOf(a.kind) - CARE_ORDER.indexOf(b.kind));
  const refund = v.entitlements.find((e) => e.kind === "REFUND");
  const denied = v.decision?.kind === "DENY_COMPENSATION";
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <PaxRefresh active={inFlight} />
      <p className="text-xs text-muted">Demo data. Fictional airline. PayPal sandbox, no real money.</p>
      <p className="mt-3 font-mono text-sm">{v.flight.number} {v.flight.originIata} to {v.flight.destinationIata}, {localTime(v.flight.schedDep, v.flight.tz)}, {v.type === "CANCELLATION" ? "cancelled" : "delayed"}</p>
      <h1 className="mt-2 text-2xl font-semibold">Hello {v.name.split(" ")[0]}</h1>

      <section className="mt-6">
        <h2 className="font-medium">What happened</h2>
        <p className="mt-1">Your flight from {v.flight.origin} to {v.flight.destination} was {v.type === "CANCELLATION" ? "cancelled" : "delayed"}. Under EU Regulation 261/2004 you have rights to care while you wait, and possibly to compensation.</p>
        {denied ? (
          <details className="mt-2 rounded border border-line p-3">
            <summary className="cursor-pointer">Why no compensation</summary>
            <p className="mt-2 text-sm">{v.decision!.reason}</p>
            <ul className="mt-2 space-y-1 text-sm">{v.decision!.citations.map((c) => <li key={c.id}><span className="font-mono">{c.id}</span>: {c.summary}</li>)}</ul>
            <p className="mt-2 text-sm">You can contest this with the airline or with the national enforcement body in the country of departure.</p>
          </details>
        ) : null}
      </section>

      <section className="mt-6 rounded border border-line bg-surface p-4">
        <h2 className="font-medium">What you get</h2>
        {comp && comp.amountCents > 0 && !denied ? (
          comp.status === "PENDING_DECISION" ? (
            <p className="mt-2">You may be owed <strong className="font-mono">{eurWords(comp.amountCents)}</strong> compensation. The airline is checking what caused the disruption, and this page will show the decision.</p>
          ) : (
            <p className="mt-2 text-lg">You will receive <strong className="font-mono">{eurWords(comp.amountCents)}</strong> compensation.</p>
          )
        ) : denied ? (
          <p className="mt-2">No compensation is being paid (see above). Care is still provided.</p>
        ) : (
          <p className="mt-2">No compensation is owed for this disruption.</p>
        )}
        {care.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {care.map((e) => (
              <li key={e.kind} className="flex justify-between gap-2">
                <span>{e.kind === "MEAL_ALLOWANCE" ? "Meal allowance, paid to you" : e.kind === "HOTEL_REIMBURSEMENT_CAP" ? "Hotel, reimbursed up to" : "Airport-hotel transport, reimbursed up to"}</span>
                <span className="font-mono tabular">{euros(e.amountCents)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {care.length ? <p className="mt-2 text-xs text-muted">Meal, hotel and transport amounts are Demo Air policy, not set by law.</p> : null}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm">How this was calculated</summary>
          {v.entitlements.filter((e) => e.amountCents > 0).map((e) => (
            <div key={e.kind} className="mt-2 text-sm">
              <p className="font-medium">{e.kind === "COMPENSATION" ? "Compensation" : e.kind === "MEAL_ALLOWANCE" ? "Meals" : e.kind === "HOTEL_REIMBURSEMENT_CAP" ? "Hotel" : e.kind === "TRANSPORT_REIMBURSEMENT_CAP" ? "Transport" : "Refund"}</p>
              <ol className="list-decimal pl-5 text-xs">{e.trace.map((s, i) => <li key={i}>{s.outcome} <span className="font-mono text-muted">({s.ruleId}{s.kind === "POLICY" ? ", Demo Air policy" : ""})</span></li>)}</ol>
            </div>
          ))}
        </details>
      </section>

      {v.type === "CANCELLATION" ? (
        <section className="mt-6">
          {v.choice === "UNDECIDED" ? <TravelForm action={chooseTravel.bind(null, token)} /> : (
            v.choice === "REFUND" ? (
              <div className="space-y-1">
                <p>Your choice: refund of your ticket{refund ? ` (${euros(refund.amountCents)})` : ""}{v.refundToPaypal ? ", back to the PayPal payment you booked with." : ", back to your original payment method (handled outside this demo)."}</p>
                {v.refundToPaypal ? (
                  <p className="text-sm" aria-live="polite">Refund status: <strong>{v.refundStatus === "COMPLETED" ? "refunded to your PayPal payment" : v.refundStatus === "FAILED" || v.refundStatus === "CANCELLED" ? "not completed; the airline has been told and will retry" : v.refundStatus ? "being processed by PayPal" : "requested"}</strong></p>
                ) : null}
                <p className="text-xs text-muted">The airline must refund within 7 days of your choice <span className="font-mono">(REG-8-1)</span>.</p>
              </div>
            ) : (
              <p>Your choice: the new flight we booked for you.</p>
            )
          )}
        </section>
      ) : null}

      <section className="mt-6">
        {v.offer.paymentChoice === "NONE" ? (
          <PaymentForm action={choosePayment.bind(null, token)} consentText={CONSENT_TEXT} />
        ) : v.offer.paymentChoice === "PAYPAL" ? (
          <div className="space-y-3">
            <h2 className="font-medium">Your payment</h2>
            <p className="text-sm">Paid through PayPal. In this demo the money goes to a sandbox account (demo pool): <span className="font-mono">{v.receiver ?? "none"}</span>.</p>
            <Tracker v={v} />
            {v.unclaimed.length ? (
              <div className="rounded border border-amber p-3 text-sm" role="status">
                {v.offer.bankSwitchRequested ? (
                  <p>You asked to switch to bank transfer. The PayPal payment must first come back to the airline (at the latest after 30 days unclaimed); then the airline pays by bank transfer to the account ending {v.offer.ibanLast4}. You will not be paid twice.</p>
                ) : (
                  <>
                    {v.unclaimed.map((u, i) => (
                      <p key={i}>{euros(u.amountCents)} is waiting for <span className="font-mono">{u.receiver}</span>. Claim it by {u.claimBy.slice(0, 10)} by creating or logging in to a PayPal account with that email address.</p>
                    ))}
                    <div className="mt-3"><BankSwitchForm action={switchToBank.bind(null, token)} /></div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p>You chose bank transfer to the account ending {v.offer.ibanLast4}. Bank transfers are recorded only; they are handled outside this demo.</p>
        )}
      </section>

      {care.length ? (
        <section className="mt-6 space-y-3" aria-labelledby="receipts-title">
          <h2 id="receipts-title" className="font-medium">Receipts</h2>
          <p className="text-sm">Spent more than your meal allowance, or paid for a hotel or taxi? Send a photo of the receipt. An AI reads it; code checks the time, the amounts and your remaining allowance, and anything unclear goes to a person. Alcohol, tobacco and duty-free goods are not covered (Demo Air policy).</p>
          {v.offer.paymentChoice === "NONE" ? <p className="text-sm text-muted">Choose how to be paid first; approved receipts are paid the same way.</p> : <ReceiptUpload token={token} demos={listDemoReceipts().map((d) => ({ key: d.key, label: d.label }))} />}
          {v.receipts.length ? (
            <ul className="space-y-2">
              {v.receipts.map((r) => (
                <li key={r.id} className="flex gap-3 rounded border border-line p-2 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image */}
                  <img src={`/api/pax/${token}/receipts/${r.id}`} alt={`Receipt${r.merchant ? ` from ${r.merchant}` : ""}`} className="h-20 w-16 shrink-0 rounded border border-line object-cover" />
                  <div>
                    <p className="font-medium">{r.merchant ?? "Receipt"}{r.total !== null ? <span className="font-mono"> {r.total.toFixed(2)} {r.currency ?? ""}</span> : null}</p>
                    <p>{r.decision === "AUTO_APPROVED" || r.decision === "APPROVED_BY_HUMAN" ? <>Approved: <span className="font-mono">{euros(r.approvedCents ?? 0)}</span>{r.payoutStatus === "SUCCESS" ? ", paid to your PayPal account" : v.offer.paymentChoice === "PAYPAL" ? ", being paid" : ", recorded for bank transfer"}</> : r.decision === "REJECTED" ? "Not reimbursed" : "A person is checking this receipt"}</p>
                    {r.reason ? <p className="text-xs text-muted">{r.reason}</p> : null}
                    {r.dateReplaced ? <p className="text-xs text-muted">Demo receipt: date replaced with the scenario date (original {r.printedDate ?? "unknown"}).</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <section className="mt-6 space-y-3" aria-labelledby="questions-title">
        <h2 id="questions-title" className="font-medium">Questions</h2>
        <Questions token={token} history={v.qa} ticketOpen={v.ticketOpen} />
      </section>
    </main>
  );
}

export default function Page(props: PageProps<"/p/[token]">) {
  return (
    <div data-theme="light" className="flex-1">
      <Suspense fallback={<p className="mx-auto max-w-md px-4 py-8">Loading your page</p>}>
        <PassengerPage {...props} />
      </Suspense>
    </div>
  );
}
