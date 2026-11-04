"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Receipt upload (photo, up to 8 MB) and demo receipts for visitors without a photo. */
export function ReceiptUpload({ token, demos }: { token: string; demos: { key: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function send(req: Promise<Response>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await req;
      const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
      setMessage(res.ok ? { error: false, text: body.reason ?? "Received." } : { error: true, text: body.error ?? "The receipt could not be sent." });
      router.refresh();
    } catch {
      setMessage({ error: true, text: "The receipt could not be sent. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(fetch(`/api/pax/${token}/receipts`, { method: "POST", body: new FormData(e.currentTarget) }));
          e.currentTarget.reset();
        }}
        className="space-y-2"
      >
        <label htmlFor="receipt" className="block text-sm">Photo of a receipt for food, drinks, hotel or transport (JPG, PNG or WebP, up to 8 MB)</label>
        <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="block w-full text-sm" />
        <button type="submit" disabled={busy} className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-60">{busy ? "Checking the receipt" : "Send receipt"}</button>
      </form>
      {demos.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer">No receipt at hand? Try a demo receipt</summary>
          <ul className="mt-2 space-y-1">
            {demos.map((d) => (
              <li key={d.key}>
                <button type="button" disabled={busy} onClick={() => void send(fetch(`/api/pax/${token}/receipts/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: d.key }) }))} className="text-left underline underline-offset-4 disabled:opacity-60">
                  {d.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {message ? <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-red" : ""}`}>{message.text}</p> : null}
    </div>
  );
}
