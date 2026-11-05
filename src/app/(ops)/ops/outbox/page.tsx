import type { Metadata } from "next";
import { Suspense } from "react";
import { disruptionScope } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { utcTime } from "@/lib/format";

export const metadata: Metadata = { title: "Simulated outbox - Groundside" };

async function Outbox() {
  const user = await requireUser();
  const messages = await getDb().outboxMessage.findMany({ where: { passenger: { disruption: disruptionScope(user) } }, orderBy: { createdAt: "desc" }, take: 200, include: { passenger: { select: { displayName: true } } } });
  if (messages.length === 0) return <p className="mt-6 text-muted">Nothing yet. Notices appear here after a decision.</p>;
  return (
    <ul className="mt-6 space-y-3">
      {messages.map((m) => (
        <li key={m.id} className="rounded border border-line p-3">
          <p className="text-xs text-muted">{utcTime(m.createdAt.toISOString())}, {m.kind.toLowerCase()}, {m.passenger.displayName}</p>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-sm">{m.renderedText}</pre>
        </li>
      ))}
    </ul>
  );
}

export default function OutboxPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">Simulated outbox</h1>
      <p className="mt-1 text-sm text-muted">Notices that would have been emailed. Nothing here is sent.</p>
      <Suspense fallback={<p className="mt-6 text-muted">Loading</p>}>
        <Outbox />
      </Suspense>
    </main>
  );
}
