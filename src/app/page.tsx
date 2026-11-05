import Link from "next/link";
import { judgeModeOn } from "@/lib/judge/run";
import { StartDemo } from "./start-demo";

export default function Home() {
  const judge = judgeModeOn();
  return (
    <div data-theme="light" className="flex-1">
      <main className="mx-auto w-full max-w-3xl px-4 py-14">
        <p className="font-mono text-sm text-muted">Groundside</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">When a flight is cancelled, check the airline&apos;s stated cause against real weather, work out what every passenger is owed under EU Regulation 261/2004, and pay them through PayPal before they leave the airport.</h1>

        <div className="mt-8">
          {judge ? (
            <StartDemo />
          ) : (
            <p className="rounded border border-line bg-surface p-5">Judge mode is off on this server. <Link href="/login" className="underline underline-offset-4">Sign in</Link> with the demo duty-manager login from the README.</p>
          )}
        </div>

        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="font-medium">How AI is used</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Checks the airline&apos;s stated cause against numbered weather facts. It recommends; only a person can deny compensation.</li>
              <li>Reads receipt photos. Code checks time, totals, duplicates and caps before anything is paid.</li>
              <li>Answers passenger questions from their own case file only, and hands over to a person when asked.</li>
              <li>Never computes money: every amount comes from tested code with a cited rule.</li>
            </ul>
          </div>
          <div>
            <h2 className="font-medium">How PayPal is used</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Payouts API: compensation, meal allowances and receipt reimbursements in idempotent micro-batches.</li>
              <li>Orders v2 and Payments v2: book a demo ticket, then refund it to the original payment.</li>
              <li>Webhooks with signature verification, plus polling that keeps status right without them.</li>
            </ul>
          </div>
        </section>

        <ul className="mt-10 space-y-2 text-sm">
          <li><Link className="underline underline-offset-4" href="/about-data">About the data: what is real (weather, law) and what is synthetic</Link></li>
          <li><Link className="underline underline-offset-4" href="/demo/book">Demo booking (PayPal sandbox)</Link></li>
          <li><Link className="underline underline-offset-4" href="/login">Sign in (demo duty manager)</Link></li>
          <li><a className="underline underline-offset-4" href="https://github.com/Nebiyu-6249/groundside" rel="noreferrer" target="_blank">Source code on GitHub (MIT)</a></li>
        </ul>
        <p className="mt-10 text-sm text-muted">Demo data. Fictional airline (Demo Air). PayPal sandbox only.</p>
      </main>
    </div>
  );
}
