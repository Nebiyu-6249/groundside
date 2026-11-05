"use client";

import { useActionState } from "react";
import { startJudgeDemo, type StartState } from "./judge-actions";

export function StartDemo() {
  const [state, run, pending] = useActionState<StartState, FormData>(startJudgeDemo, { error: null });
  return (
    <form action={run} className="space-y-4 rounded border border-line bg-surface p-5">
      <fieldset className="space-y-2">
        <legend className="font-medium">Choose a disruption</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="scenario" value="A" defaultChecked className="mt-1" />
          <span><span className="font-medium">A: the weather that wasn&apos;t.</span> DEMO 412 Frankfurt to Dubai is cancelled &quot;due to weather&quot;, but the archived weather was clear. The AI should find the claim unsupported.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="scenario" value="B" className="mt-1" />
          <span><span className="font-medium">B: real fog.</span> DEMO 207 Milan to Lisbon is cancelled in freezing fog. The AI should find the claim supported; a duty manager signs the denial, and meals are still paid.</span>
        </label>
      </fieldset>
      <button type="submit" disabled={pending} className="w-full rounded bg-amber px-4 py-3 font-medium text-on-amber disabled:opacity-60 sm:w-auto">
        {pending ? "Setting up your copy" : "Start the judge demo"}
      </button>
      <p className="text-sm text-muted">You get your own copy with 12 passengers, signed in as its duty manager, for 24 hours. Payouts use the PayPal sandbox; no real money moves. The first start after a quiet spell can take up to a minute while the free server wakes.</p>
      {state.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
    </form>
  );
}
