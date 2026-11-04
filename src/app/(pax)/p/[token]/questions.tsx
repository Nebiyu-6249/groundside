"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Question box (A4) and "Talk to a person". Answers come from the case file only. */
export function Questions({ token, history, ticketOpen }: { token: string; history: { role: "PASSENGER" | "ASSISTANT"; text: string }[]; ticketOpen: boolean }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerHuman, setOfferHuman] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; offerHuman?: boolean };
    if (!res.ok) throw new Error(json.error ?? "Something went wrong. Try again.");
    return json;
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post(`/api/pax/${token}/questions`, { question });
      setOfferHuman(Boolean(r.offerHuman));
      setQuestion("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setOfferHuman(true);
    } finally {
      setBusy(false);
    }
  }

  async function person() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/pax/${token}/tickets`, { reason: question });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {history.length ? (
        <ol className="space-y-2" aria-label="Your questions and answers">
          {history.map((m, i) => (
            <li key={i} className={`whitespace-pre-line rounded p-2 text-sm ${m.role === "PASSENGER" ? "ml-8 bg-surface" : "mr-8 border border-line"}`}>
              <span className="sr-only">{m.role === "PASSENGER" ? "You asked: " : "Answer: "}</span>
              {m.text}
            </li>
          ))}
        </ol>
      ) : null}
      <form onSubmit={ask} className="space-y-2">
        <label htmlFor="question" className="block text-sm">Ask about your flight, your payment or your rights</label>
        <textarea id="question" value={question} onChange={(e) => setQuestion(e.target.value)} required minLength={3} maxLength={1000} rows={2} className="w-full rounded border border-line bg-surface px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">{busy ? "Answering" : "Ask"}</button>
          {ticketOpen ? (
            <span role="status" className="text-sm">A person from the airline will contact you.</span>
          ) : (
            <button type="button" onClick={person} disabled={busy} className={`rounded border px-4 py-2 text-sm disabled:opacity-60 ${offerHuman ? "border-amber" : "border-ink"}`}>Talk to a person</button>
          )}
        </div>
      </form>
      {error ? <p role="alert" className="text-sm text-red">{error}</p> : null}
      <p className="text-xs text-muted">Answers are written by an AI from your case file and checked by code. They are not legal advice.</p>
    </div>
  );
}
