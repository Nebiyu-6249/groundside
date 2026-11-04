import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chip, EntitlementStatus, PayoutStatus, RecommendationChip } from "@/components/status";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { euros, localTime, utcTime } from "@/lib/format";
import { disruptionDetail, type DisruptionDetail } from "@/lib/ops/queries";
import { payoutSettings } from "@/lib/payouts/orchestrator";
import { approve, assess, deny, openAsPassenger, releaseCareNow, simulateResponses, syncWithPaypal } from "../../actions";
import { ActionButton, ApproveForm, DenyForm, LiveRefresh } from "./client";
import { PassengersGrid } from "./passengers-grid";

export const metadata: Metadata = { title: "Disruption - Groundside" };

const TABS = [
  ["overview", "Overview"],
  ["evidence", "Evidence"],
  ["assessment", "Assessment"],
  ["passengers", "Passengers"],
  ["payouts", "Payouts"],
  ["audit", "Audit"],
] as const;
type Tab = (typeof TABS)[number][0];

function Header({ d }: { d: DisruptionDetail }) {
  const missingEmail = d.passengers.filter((p) => !p.email).length;
  const unregistered = d.passengers.filter((p) => p.receiverKind === "UNREGISTERED").length;
  const needsCheck = d.passengers.filter((p) => p.entitlements.some((e) => e.status === "NEEDS_HUMAN_CHECK")).length;
  const outOfScope = d.passengers.filter((p) => p.entitlements.length === 0).length;
  return (
    <header>
      <p className="text-sm text-muted"><Link href="/ops" className="underline underline-offset-4">Disruptions</Link> / scenario {d.scenarioKey}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{d.flight.number}</h1>
        <span className="font-mono">{d.flight.origin.iata} to {d.flight.destination.iata}</span>
        <Chip>{d.type === "CANCELLATION" ? "Cancelled" : "Delayed"}</Chip>
        <Chip>{d.status.replace("_", " ").toLowerCase()}</Chip>
        <Chip>Demo data</Chip>
      </div>
      <p className="mt-1 text-sm text-muted">
        Scheduled {localTime(d.flight.schedDep, d.flight.origin.tz)} from {d.flight.origin.city}, arriving {localTime(d.flight.schedArr, d.flight.destination.tz)} in {d.flight.destination.city}. Aircraft {d.flight.aircraft ?? "unknown"}{d.flight.previous ? `, previous flight ${d.flight.previous.number} ${d.flight.previous.origin} to ${d.flight.previous.destination}` : ""}.
      </p>
      <section aria-label="Readiness" className="mt-3 flex flex-wrap gap-2 text-xs">
        <Chip>{d.passengers.length} passengers</Chip>
        <Chip tone={missingEmail ? "attention" : "neutral"}>{missingEmail} without email</Chip>
        <Chip tone={unregistered ? "attention" : "neutral"}>{unregistered} with no PayPal account yet</Chip>
        <Chip tone={needsCheck ? "attention" : "neutral"}>{needsCheck} need a human check</Chip>
        <Chip>{outOfScope} out of scope</Chip>
      </section>
    </header>
  );
}

function Overview({ d }: { d: DisruptionDetail }) {
  const approvedAt = d.audit.find((a) => a.action === "DECISION_APPROVE" || a.action === "DECISION_DENY")?.at;
  const firstPaid = d.audit.find((a) => a.action === "PAYOUT_ITEM_STATUS" && a.summary.includes("to SUCCESS"))?.at;
  const minutes = approvedAt && firstPaid ? Math.round((Date.parse(firstPaid) - Date.parse(approvedAt)) / 6000) / 10 : null;
  const paid = d.passengers.flatMap((p) => p.entitlements).filter((e) => e.status === "PAID");
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-line p-3"><p className="text-xs text-muted">Paid so far</p><p className="mt-1 font-mono text-xl tabular">{euros(paid.reduce((s, e) => s + e.amountCents, 0))}</p><p className="text-xs text-muted">{paid.length} payments</p></div>
        <div className="rounded border border-line p-3"><p className="text-xs text-muted">Time from decision to first passenger paid</p><p className="mt-1 font-mono text-xl tabular">{minutes === null ? "Not yet" : `${minutes} min`}</p><p className="text-xs text-muted">Measured in this run</p></div>
        <div className="rounded border border-line p-3"><p className="text-xs text-muted">AI recommendation</p><div className="mt-2"><RecommendationChip value={d.assessment?.shown} /></div><p className="mt-1 text-xs text-muted">AI recommendation. A duty manager decides.</p></div>
      </div>
      <div>
        <h2 className="font-medium">Timeline</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {d.audit.filter((a) => !a.action.startsWith("PAYOUT_ITEM")).map((a) => (
            <li key={a.id} className="flex gap-3"><span className="w-44 shrink-0 font-mono text-xs text-muted tabular">{utcTime(a.at)}</span><span>{a.summary}</span></li>
          ))}
          {d.audit.length === 0 ? <li className="text-muted">Nothing has happened yet. Start with the Evidence tab.</li> : null}
        </ol>
      </div>
    </div>
  );
}

function Evidence({ d }: { d: DisruptionDetail }) {
  const weather = d.evidence.filter((e) => e.kind === "METAR" || e.kind === "TAF");
  const byAirport = Object.entries(Object.groupBy(d.facts, (f) => f.airport));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded border border-line p-3"><h2 className="text-sm font-medium">Airline ops note (Demo data)</h2><pre className="mt-2 whitespace-pre-wrap font-mono text-sm">{d.opsNote}</pre></section>
        <section className="rounded border border-line p-3"><h2 className="text-sm font-medium">Maintenance log (Demo data)</h2><pre className="mt-2 whitespace-pre-wrap font-mono text-sm">{d.maintenanceLog || "None"}</pre></section>
      </div>
      <section>
        <h2 className="font-medium">Weather reports</h2>
        <p className="mt-1 text-sm text-muted">Forecasts (TAF) not available for this archived date; observations (METAR) only.</p>
        <ul className="mt-2 space-y-1 text-sm">
          {weather.map((e) => (
            <li key={e.id}>
              <span className="font-mono">{e.airportIcao}</span>: real archived weather report, retrieved {e.retrievedAt ? utcTime(e.retrievedAt) : "unknown"} from the Iowa Environmental Mesonet (Iowa State University).{" "}
              {e.sourceUrl ? <a href={e.sourceUrl} className="underline underline-offset-4" rel="noreferrer" target="_blank">Source query</a> : null}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-medium">Facts (computed by code; the AI may cite only these IDs)</h2>
        {byAirport.map(([icao, facts]) => (
          <details key={icao} className="mt-2 rounded border border-line p-2" open={icao === d.flight.origin.icao}>
            <summary className="cursor-pointer font-mono text-sm">{icao} ({facts?.length} facts)</summary>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {facts?.filter((f) => f.kind === "INDICATOR").concat(facts.filter((f) => f.kind !== "INDICATOR")).map((f) => (
                  <tr key={f.id} id={f.id} className="border-t border-line align-top">
                    <td className="py-1 pr-3 font-mono text-muted">{f.id}</td>
                    <td className="py-1">{f.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </section>
    </div>
  );
}

async function Assessment({ d }: { d: DisruptionDetail }) {
  const user = await requireUser();
  const a = d.assessment;
  const o = a?.output;
  const ruleChip = (id: string) => (
    <a key={id} href={d.rules[id]?.url} target="_blank" rel="noreferrer" title={d.rules[id]?.summary} className="rounded border border-line px-1.5 py-0.5 font-mono text-xs hover:border-amber">{id}</a>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton action={assess.bind(null, d.id)} label={a ? "Re-run AI assessment" : "Run AI assessment"} pendingLabel="Assessing" tone={a ? "neutral" : "primary"} />
        {a ? <p className="text-xs text-muted">Model {a.model}, prompt {a.promptVersion}, {a.retries} retr{a.retries === 1 ? "y" : "ies"}, about {a.costUsd.toFixed(4)} USD, {utcTime(a.at)}</p> : null}
      </div>
      {a?.notice ? <p role="status" className="rounded border border-amber p-2 text-sm text-amber">{a.notice}</p> : null}
      {a && o ? (
        <section className="space-y-4 rounded border border-line p-4">
          <div className="flex flex-wrap items-center gap-2"><RecommendationChip value={a.shown} /><span className="text-sm text-muted">AI recommendation. A duty manager decides.</span></div>
          {a.modelRecommendation && a.modelRecommendation !== a.shown ? <p className="text-xs text-muted">The model&apos;s own label was {a.modelRecommendation}; the shown recommendation comes from the code policy.</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div><h3 className="text-sm font-medium">Stated cause</h3><p className="mt-1 text-sm">{o.statedCause.category.toLowerCase().replaceAll("_", " ")} at {o.statedCause.location.toLowerCase().replaceAll("_", " ")}</p>{o.statedCause.quote ? <blockquote className="mt-1 border-l-2 border-line pl-2 font-mono text-xs">{o.statedCause.quote}</blockquote> : null}<p className="mt-2 text-sm">Claim support: <strong>{o.claimSupport.replaceAll("_", " ").toLowerCase()}</strong></p></div>
            <div><h3 className="text-sm font-medium">Likely cause</h3><p className="mt-1 text-sm">{o.likelyCause.category.toLowerCase().replaceAll("_", " ")} at {o.likelyCause.location.toLowerCase().replaceAll("_", " ")}, {o.likelyCause.confidence.toLowerCase()} confidence</p><p className="mt-2 text-sm">Extraordinary circumstances: <strong>{o.extraordinaryAssessment.replaceAll("_", " ").toLowerCase()}</strong>{o.knockOnFromPreviousFlight ? " (knock-on from the previous flight)" : ""}</p></div>
          </div>
          <div>
            <h3 className="text-sm font-medium">Findings</h3>
            <ul className="mt-1 space-y-2 text-sm">
              {o.findings.map((f, i) => (
                <li key={i} className="rounded border border-line p-2">
                  <p><Chip tone={f.effect === "CONTRADICTS_STATED_CAUSE" ? "attention" : "neutral"}>{f.effect.replaceAll("_", " ").toLowerCase()}</Chip> {f.statement}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.factIds.map((id) => <a key={id} href={`?tab=evidence#${id}`} className="rounded border border-line px-1.5 py-0.5 font-mono text-xs hover:border-amber">{id}</a>)}
                    {f.evidenceQuotes.map((q, j) => <span key={j} className="font-mono text-xs text-muted">&quot;{q}&quot;</span>)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div><h3 className="text-sm font-medium">What the carrier would still need to show</h3><p className="mt-1 text-sm">{o.reasonableMeasuresNote}</p></div>
          <div><h3 className="text-sm font-medium">Questions for the duty manager</h3><ul className="mt-1 list-disc pl-5 text-sm">{o.questionsForDutyManager.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
          <div><h3 className="text-sm font-medium">Summary</h3><p className="mt-1 text-sm">{o.summary}</p></div>
          <div className="flex flex-wrap items-center gap-1"><span className="text-sm">Rules cited:</span>{o.citations.map(ruleChip)}</div>
        </section>
      ) : !a ? (
        <p className="text-muted">Not assessed yet. The AI reads the ops note, the maintenance log and the weather facts, and says whether the stated cause is supported.</p>
      ) : null}

      {!d.decision ? (
        <section aria-label="Care" className="rounded border border-line p-4">
          <h2 className="font-medium">Meal allowances</h2>
          {d.careReleasedAt ? (
            <p className="mt-1 text-sm">Released {utcTime(d.careReleasedAt)}. Passengers can choose how to be paid; compensation waits for the decision below.</p>
          ) : (
            <>
              <p className="mt-1 text-sm">Care is owed whatever caused the disruption, so meal allowances can be paid now, before the compensation decision.</p>
              {user.role === "DUTY_MANAGER" ? <div className="mt-3"><ActionButton action={releaseCareNow.bind(null, d.id)} label="Release meal allowances now" pendingLabel="Releasing" /></div> : null}
            </>
          )}
        </section>
      ) : null}

      <section aria-label="Decision">
        <h2 className="font-medium">Decision</h2>
        {d.decision ? (
          <div className="mt-2 rounded border border-line p-4 text-sm">
            <p>{d.decision.kind === "APPROVE_COMPENSATION" ? "Compensation approved" : "Compensation denied"} by {d.decision.by}, signed &quot;{d.decision.typedName}&quot;, {utcTime(d.decision.at)}.</p>
            <p className="mt-1">Reason: {d.decision.reason}</p>
            {d.decision.citations.length ? <div className="mt-1 flex flex-wrap gap-1">{d.decision.citations.map(ruleChip)}</div> : null}
            {d.decision.differsFromAi ? <p className="mt-1 text-xs text-muted">This decision differs from the AI recommendation.</p> : null}
          </div>
        ) : user.role !== "DUTY_MANAGER" ? (
          <p className="mt-2 text-sm text-muted">Only a duty manager can decide.</p>
        ) : (
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            <ApproveForm action={approve.bind(null, d.id)} aiDiffers={!!a && a.shown !== "PAY_COMPENSATION"} />
            <DenyForm action={deny.bind(null, d.id)} userName={user.name} citable={d.citable} />
          </div>
        )}
      </section>
    </div>
  );
}

function Payouts({ d }: { d: DisruptionDetail }) {
  const settings = payoutSettings();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton action={syncWithPaypal.bind(null, d.id)} label="Sync with PayPal" pendingLabel="Syncing" />
        <span className="text-xs text-muted">Micro-batches of {settings.batchSize}, priority passengers first. Daily payout cap {euros(settings.dailyCapCents)} (sandbox).</span>
      </div>
      {d.batches.length === 0 ? <p className="text-muted">No payouts yet. They start when passengers choose PayPal, after care is released or a decision is made.</p> : null}
      {d.batches.map((b) => (
        <section key={b.id} className="rounded border border-line p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono">{b.senderBatchId}</span>
            <PayoutStatus status={b.status === "FAILED_TO_CREATE" ? "FAILED" : b.status} />
            <span className="text-muted">{b.kind.toLowerCase()}, {b.itemCount} items, {euros(b.totalCents)}</span>
            <span className="font-mono text-xs text-muted">PayPal batch {b.paypalBatchId ?? "not created yet"}</span>
            {b.lastError ? <span className="text-xs text-red">{b.lastError}</span> : null}
          </div>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="py-1 font-medium">Passenger</th><th className="font-medium">Kind</th><th className="font-medium">Sandbox receiver (demo pool)</th><th className="font-medium">Amount</th><th className="font-medium">Status</th></tr></thead>
            <tbody>
              {b.items.map((i) => (
                <tr key={i.id} className="border-t border-line"><td className="py-1">{i.name}</td><td>{i.kind === "COMPENSATION" ? "Compensation" : "Meals"}</td><td className="font-mono">{i.receiver}</td><td className="font-mono tabular">{euros(i.amountCents)}</td><td><PayoutStatus status={i.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <section>
        <h2 className="font-medium">Webhook log</h2>
        {d.webhooks.length === 0 ? <p className="mt-1 text-sm text-muted">No webhook events yet. Polling keeps the status correct without them.</p> : (
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="py-1 font-medium">Received</th><th className="font-medium">Type</th><th className="font-medium">Verified</th><th className="font-medium">Processed</th></tr></thead>
            <tbody>{d.webhooks.map((w) => <tr key={w.id} className="border-t border-line"><td className="py-1 font-mono">{utcTime(w.receivedAt)}</td><td className="font-mono">{w.eventType}</td><td>{w.verified ? "Yes" : "No"}</td><td>{w.error ? `Error: ${w.error}` : w.processedAt ? "Yes" : "No"}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Audit({ d }: { d: DisruptionDetail }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Time</th><th className="font-medium">Actor</th><th className="font-medium">Action</th><th className="font-medium">Summary</th></tr></thead>
      <tbody>{d.audit.map((a) => <tr key={a.id} className="border-t border-line align-top"><td className="py-1 pr-3 font-mono text-xs tabular">{utcTime(a.at)}</td><td className="pr-3 text-xs">{a.actorType}</td><td className="pr-3 font-mono text-xs">{a.action}</td><td>{a.summary}</td></tr>)}</tbody>
    </table>
  );
}

async function Detail({ params, searchParams }: PageProps<"/ops/disruptions/[id]">) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.some(([t]) => t === sp.tab) ? sp.tab : "overview") as Tab;
  const d = await disruptionDetail(getDb(), id);
  if (!d) notFound();
  const inFlight = d.batches.some((b) => !["SUCCESS", "DENIED", "CANCELED", "FAILED_TO_CREATE"].includes(b.status) || b.items.some((i) => ["CREATING", "PENDING", "ONHOLD", "UNCLAIMED"].includes(i.status)));
  const pending = d.passengers.filter((p) => p.paymentChoice === "NONE").length;
  return (
    <>
      <Header d={d} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <nav aria-label="Disruption sections" className="flex gap-1">
          {TABS.map(([t, label]) => (
            <Link key={t} href={`?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={`border-b-2 px-3 py-2 text-sm ${t === tab ? "border-amber" : "border-transparent text-muted hover:text-foreground"}`}>{label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 pb-1">
          <LiveRefresh disruptionId={d.id} active={inFlight} />
          {(d.decision || d.careReleasedAt) && pending > 0 ? <ActionButton action={simulateResponses.bind(null, d.id)} label={`Simulate passenger responses (${pending})`} pendingLabel="Simulating" /> : null}
        </div>
      </div>
      <div className="mt-6">
        {tab === "overview" ? <Overview d={d} /> : null}
        {tab === "evidence" ? <Evidence d={d} /> : null}
        {tab === "assessment" ? <Assessment d={d} /> : null}
        {tab === "passengers" ? <PassengersGrid rows={d.passengers} rules={d.rules} openAsPassenger={openAsPassenger} /> : null}
        {tab === "payouts" ? <Payouts d={d} /> : null}
        {tab === "audit" ? <Audit d={d} /> : null}
      </div>
      {tab === "passengers" ? <p className="mt-2 text-xs text-muted">Click a row for the full entitlement trace. Statuses: <EntitlementStatus status="PAID" /> paid only after PayPal reports success.</p> : null}
    </>
  );
}

export default function DisruptionPage(props: PageProps<"/ops/disruptions/[id]">) {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Suspense fallback={<p className="text-muted">Loading disruption</p>}>
        <Detail {...props} />
      </Suspense>
    </main>
  );
}
