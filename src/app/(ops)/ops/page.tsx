import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Chip, RecommendationChip } from "@/components/status";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { euros, localTime } from "@/lib/format";
import { boardRows } from "@/lib/ops/queries";

export const metadata: Metadata = { title: "Disruptions - Groundside" };

async function Board() {
  await requireUser();
  const rows = await boardRows(getDb());
  if (rows.length === 0) {
    return <p className="mt-6 text-muted">No disruptions yet. Run <code className="font-mono">npm run reset-demo</code> to load the demo scenarios.</p>;
  }
  return (
    <div className="mt-6 overflow-x-auto rounded border border-line">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            {["Flight", "Route", "Scheduled (local)", "Type", "Passengers", "AI recommendation", "Decision", "Paid", "Attention"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface">
              <td className="px-3 py-2 font-mono">
                <Link href={`/ops/disruptions/${r.id}`} className="underline decoration-line underline-offset-4 hover:decoration-amber">{r.flightNumber}</Link>
              </td>
              <td className="px-3 py-2 font-mono">{r.route}</td>
              <td className="px-3 py-2 font-mono tabular">{localTime(r.schedDep, r.tz)}</td>
              <td className="px-3 py-2">{r.type === "CANCELLATION" ? "Cancelled" : "Delayed"}</td>
              <td className="px-3 py-2 font-mono tabular">{r.passengers}</td>
              <td className="px-3 py-2"><RecommendationChip value={r.recommendation} />{r.cachedAi ? <span className="ml-1 text-xs text-muted">cached</span> : null}</td>
              <td className="px-3 py-2">{r.decision === "APPROVE_COMPENSATION" ? <Chip>Approved</Chip> : r.decision === "DENY_COMPENSATION" ? <Chip tone="error">Denial signed</Chip> : <span className="text-muted">Pending</span>}</td>
              <td className="px-3 py-2 font-mono tabular">{r.paidCount} / {euros(r.paidCents)}</td>
              <td className="px-3 py-2">{r.flags.length ? r.flags.map((f) => <Chip key={f} tone="attention">{f}</Chip>) : <span className="text-muted">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OpsBoardPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-xl font-semibold">Disruptions</h1>
      <p className="mt-1 text-sm text-muted">Demo data: the airline, flights and passengers are fictional. Weather is real archived data.</p>
      <Suspense fallback={<p className="mt-6 text-muted">Loading disruptions</p>}>
        <Board />
      </Suspense>
    </main>
  );
}
