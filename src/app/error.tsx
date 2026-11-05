"use client";

import Link from "next/link";
import { useEffect } from "react";

// Any unexpected error: a plain explanation and a way forward, never a stack trace (SPEC 12,
// golden rule 12). Payouts are idempotent, so trying again cannot pay anyone twice.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const digest = (error as { digest?: string } | null)?.digest;
    console.error(JSON.stringify({ evt: "page_error", digest: digest ?? null }));
  }, [error]);
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="mt-2">Nothing was lost, and no payment is sent twice: every payment has its own idempotency key. Try again; if it keeps failing, go back to the start.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => retry()} className="rounded bg-amber px-4 py-2 text-sm font-medium text-ink">Try again</button>
        <Link href="/" className="rounded border border-line px-4 py-2 text-sm">Back to the start</Link>
      </div>
    </main>
  );
}
