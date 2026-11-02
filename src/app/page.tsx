import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
      <p className="font-mono text-sm text-muted">Groundside</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight">
        Check the airline&apos;s stated cause, compute what each passenger is owed, pay them through
        PayPal.
      </h1>
      <p className="mt-4 text-muted">
        In development. The ops console and judge demo arrive in later phases. Everything here runs
        on the PayPal sandbox; no real money moves.
      </p>
      <ul className="mt-8 space-y-2">
        <li>
          <Link className="underline" href="/demo/book">
            Demo booking (PayPal sandbox)
          </Link>
        </li>
        <li>
          <Link className="underline" href="/api/health">
            Health check
          </Link>
        </li>
      </ul>
      <p className="mt-12 text-sm text-muted">Demo data. Fictional airline.</p>
    </main>
  );
}
