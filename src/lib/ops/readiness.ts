// Readiness panel (SPEC F6): what a duty manager should see before approving. Every check must
// be green, or the duty manager acknowledges the open ones when approving.

import type { PrismaClient } from "@/generated/prisma/client";
import { loadRulePack, statusMap } from "@/lib/rules/pack";
import { paidTodayCents, payoutSettings } from "@/lib/payouts/orchestrator";

/** Sandbox payouts cost 2 percent of each item (docs/PHASE0_RESULTS.md, item 1). */
export const SANDBOX_FEE_RATE = 0.02;

export interface ReadinessInput {
  requiredAirports: string[];
  airportsWithFacts: string[];
  assessment: { valid: boolean; usedFixture: boolean } | null;
  ruleIdsUsed: string[];
  ruleStatus: ReadonlyMap<string, string>;
  passengersMissingContact: string[];
  payableCents: number;
  capRemainingCents: number;
  balanceEstimateCents: number | null;
  lastWebhookAt: string | null;
}

export interface ReadinessCheck {
  id: "evidence" | "assessment" | "rules" | "contact" | "money" | "webhooks";
  label: string;
  ok: boolean;
  detail: string;
}

const eur = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

export function readinessChecks(i: ReadinessInput): ReadinessCheck[] {
  const missingAirports = i.requiredAirports.filter((a) => !i.airportsWithFacts.includes(a));
  const unverified = [...new Set(i.ruleIdsUsed)].filter((id) => i.ruleStatus.get(id) !== "VERIFIED");
  const needed = Math.round(i.payableCents * (1 + SANDBOX_FEE_RATE));
  const limit = i.balanceEstimateCents === null ? i.capRemainingCents : Math.min(i.capRemainingCents, i.balanceEstimateCents);
  return [
    {
      id: "evidence",
      label: "Weather evidence",
      ok: missingAirports.length === 0,
      detail: missingAirports.length === 0 ? `Facts for all ${i.requiredAirports.length} airports: ${i.requiredAirports.join(", ")}` : `No weather facts for ${missingAirports.join(", ")}`,
    },
    {
      id: "assessment",
      label: "AI assessment",
      ok: !!i.assessment && i.assessment.valid && !i.assessment.usedFixture,
      detail: !i.assessment ? "Not run yet" : !i.assessment.valid ? "Failed validation; shown as uncertain" : i.assessment.usedFixture ? "Cached result: live AI was unavailable" : "Validated live result",
    },
    {
      id: "rules",
      label: "Rule pack",
      ok: unverified.length === 0,
      detail: unverified.length === 0 ? `All ${new Set(i.ruleIdsUsed).size} rules used by this disruption are VERIFIED` : `Not verified: ${unverified.join(", ")}`,
    },
    {
      id: "contact",
      label: "Passenger contact",
      ok: i.passengersMissingContact.length === 0,
      detail: i.passengersMissingContact.length === 0 ? "Every passenger has an email address" : `No email address: ${i.passengersMissingContact.join(", ")}. Ops must reach them another way.`,
    },
    {
      id: "money",
      label: "Payout funds",
      ok: needed <= limit,
      detail: `${eur(needed)} needed (${eur(i.payableCents)} plus the 2 percent sandbox fee); ${i.balanceEstimateCents === null ? `${eur(i.capRemainingCents)} left under today's cap. The sandbox balance cannot be read through the API (HTTP 403)` : `${eur(limit)} available (lower of today's cap and the balance estimate)`}`,
    },
    {
      id: "webhooks",
      label: "Webhooks",
      ok: true,
      detail: i.lastWebhookAt ? `Last PayPal webhook received ${i.lastWebhookAt.replace("T", " ").slice(0, 16)} UTC` : "No webhook received yet. Polling keeps payout status correct without them.",
    },
  ];
}

/** Loads the inputs for one disruption. */
export async function loadReadiness(db: PrismaClient, disruptionId: string): Promise<ReadinessCheck[]> {
  const d = await db.disruption.findUniqueOrThrow({
    where: { id: disruptionId },
    include: {
      flight: { include: { previousFlight: true } },
      facts: { select: { airportIcao: true }, distinct: ["airportIcao"] },
      assessments: { orderBy: { createdAt: "desc" }, take: 1, select: { validation: true, usedFixture: true, output: true } },
      passengers: { select: { displayName: true, displayEmail: true, entitlements: { select: { kind: true, status: true, amountCents: true, trace: true } } } },
    },
  });
  const prev = d.flight.previousFlight;
  const requiredAirports = [...new Set([d.flight.origin, d.flight.destination, ...(prev ? [prev.origin, prev.destination] : [])])];
  const a = d.assessments[0];
  const output = a?.output as { assessment?: { citations?: string[] } | null } | undefined;
  const ents = d.passengers.flatMap((p) => p.entitlements);
  const ruleIdsUsed = [
    ...ents.flatMap((e) => (e.trace as { ruleId: string }[]).map((s) => s.ruleId)),
    ...(output?.assessment?.citations ?? []),
  ];
  const payableCents = ents
    .filter((e) => (e.kind === "COMPENSATION" || e.kind === "MEAL_ALLOWANCE") && e.amountCents > 0 && !["NOT_OWED", "PAID", "PAYING"].includes(e.status))
    .reduce((s, e) => s + e.amountCents, 0);
  const settings = payoutSettings();
  const balance = Number(process.env.SANDBOX_BALANCE_ESTIMATE_EUR);
  const lastWebhook = await db.webhookEvent.findFirst({ where: { verified: true }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
  return readinessChecks({
    requiredAirports,
    airportsWithFacts: d.facts.map((f) => f.airportIcao),
    assessment: a ? { valid: (a.validation as { ok?: boolean }).ok === true, usedFixture: a.usedFixture } : null,
    ruleIdsUsed,
    ruleStatus: statusMap(loadRulePack()),
    passengersMissingContact: d.passengers.filter((p) => !p.displayEmail).map((p) => p.displayName),
    payableCents,
    capRemainingCents: Math.max(0, settings.dailyCapCents - (await paidTodayCents(db))),
    balanceEstimateCents: Number.isFinite(balance) && balance > 0 ? Math.round(balance * 100) : null,
    lastWebhookAt: lastWebhook?.receivedAt.toISOString() ?? null,
  });
}
