"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { ActionState } from "../../actions";

/** A button bound to a server action that takes no form data. */
export function ActionButton({ action, label, pendingLabel, tone = "neutral" }: { action: () => Promise<ActionState>; label: string; pendingLabel: string; tone?: "neutral" | "primary" }) {
  const [state, run, pending] = useActionState<ActionState>(async () => action(), { error: null });
  return (
    <form action={run} className="inline-flex flex-col gap-1">
      <button type="submit" disabled={pending} className={tone === "primary" ? "rounded bg-amber px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-60" : "rounded border border-line px-3 py-1.5 text-sm hover:border-amber disabled:opacity-60"}>
        {pending ? pendingLabel : label}
      </button>
      {state.error ? <span role="alert" className="text-xs text-red">{state.error}</span> : state.ok ? <span role="status" className="text-xs text-muted">{state.ok}</span> : null}
    </form>
  );
}

export function ApproveForm({ action, aiDiffers }: { action: (prev: ActionState, form: FormData) => Promise<ActionState>; aiDiffers: boolean }) {
  const [state, run, pending] = useActionState(action, { error: null });
  return (
    <form action={run} className="space-y-3 rounded border border-line p-4">
      <h3 className="font-medium">Approve compensation</h3>
      <p className="text-sm text-muted">Pays compensation, meals and care as computed. Passengers receive their offer in the outbox.</p>
      {aiDiffers ? (
        <div>
          <label htmlFor="differsReason" className="block text-sm">The AI did not recommend paying. Why are you approving?</label>
          <textarea id="differsReason" name="differsReason" required minLength={10} rows={2} className="mt-1 w-full rounded border border-line bg-background px-2 py-1 text-sm" />
        </div>
      ) : null}
      {state.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{state.ok}</p> : null}
      <button type="submit" disabled={pending} className="rounded bg-amber px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-60">{pending ? "Approving" : "Approve compensation"}</button>
    </form>
  );
}

export function DenyForm({ action, userName, citable }: { action: (prev: ActionState, form: FormData) => Promise<ActionState>; userName: string; citable: { id: string; title: string }[] }) {
  const [state, run, pending] = useActionState(action, { error: null });
  return (
    <form action={run} className="space-y-3 rounded border border-line p-4">
      <h3 className="font-medium">Sign a denial of compensation</h3>
      <p className="text-sm text-muted">Only a duty manager can deny compensation. Meals, hotel and transport are still paid.</p>
      <div>
        <label htmlFor="reason" className="block text-sm">Reason (shown to passengers)</label>
        <textarea id="reason" name="reason" required minLength={20} rows={3} className="mt-1 w-full rounded border border-line bg-background px-2 py-1 text-sm" />
      </div>
      <fieldset>
        <legend className="text-sm">Rules relied on (at least one)</legend>
        <div className="mt-1 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded border border-line p-2 text-xs sm:grid-cols-2">
          {citable.map((r) => (
            <label key={r.id} className="flex items-start gap-1.5">
              <input type="checkbox" name="citations" value={r.id} className="mt-0.5" />
              <span><span className="font-mono">{r.id}</span> {r.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="typedName" className="block text-sm">Type your name to sign: {userName}</label>
        <input id="typedName" name="typedName" required autoComplete="off" className="mt-1 w-full rounded border border-line bg-background px-2 py-1 text-sm" />
      </div>
      {state.error ? <p role="alert" className="text-sm text-red">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{state.ok}</p> : null}
      <button type="submit" disabled={pending} className="rounded border border-red px-3 py-1.5 text-sm text-red disabled:opacity-60">{pending ? "Signing" : "Sign denial"}</button>
    </form>
  );
}

/** Polls the status endpoint while payouts are in flight and refreshes the page on change. */
export function LiveRefresh({ disruptionId, active }: { disruptionId: string; active: boolean }) {
  const router = useRouter();
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/disruptions/${disruptionId}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as { fingerprint: string };
      if (s.fingerprint !== last) {
        setLast(s.fingerprint);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [active, disruptionId, last, router]);
  return active ? <span role="status" className="text-xs text-muted">Payouts in flight: updating every 3 seconds</span> : null;
}
