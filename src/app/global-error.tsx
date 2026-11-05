"use client";

// Last-resort boundary when the root layout itself fails. It has to bring its own html and body.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f6f3ec", color: "#141a22", margin: 0 }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 16px" }}>
          <h1 style={{ fontSize: 20 }}>Groundside could not load</h1>
          <p>Nothing was lost, and no payment is sent twice. Try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ padding: "8px 16px", marginTop: 16 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
