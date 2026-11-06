// When payouts are held, and why (SPEC 14 guard rails). Two reasons: today's demo payout cap
// (PAYOUT_DAILY_CAP_EUR, counted from 00:00 UTC) is used up, or PayPal refused a batch because the
// sandbox business balance is too low (INSUFFICIENT_FUNDS). Held payments stay queued, and nothing
// else in the demo depends on them.

import type { PrismaClient } from "@/generated/prisma/client";
import { NO_MONEY } from "./transitions";

/** After PayPal reports insufficient funds, no new batch is tried for this long. */
export const BALANCE_PAUSE_MINUTES = 30;
export const INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS";

export interface PayoutHold {
  kind: "CAP" | "BALANCE";
  capCents: number;
  sentTodayCents: number;
  /** When a cap hold lifts (next 00:00 UTC); null for a balance hold. */
  resumesAt: string | null;
}

export function startOfUtcDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function sentTodayCents(db: PrismaClient, now = new Date()): Promise<number> {
  const agg = await db.payoutItem.aggregate({ _sum: { amountCents: true }, where: { createdAt: { gte: startOfUtcDay(now) }, status: { notIn: [...NO_MONEY] } } });
  return agg._sum.amountCents ?? 0;
}

/** True while a recent batch was refused for insufficient funds. */
export async function balancePaused(db: PrismaClient, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - BALANCE_PAUSE_MINUTES * 60_000);
  return (await db.payoutBatch.count({ where: { status: "FAILED_TO_CREATE", lastError: { startsWith: INSUFFICIENT_FUNDS }, updatedAt: { gte: since } } })) > 0;
}

/** The current hold, if any. A cap hold needs the orchestrator to have held a payment today. */
export async function payoutHold(db: PrismaClient, capCents: number, now = new Date()): Promise<PayoutHold | null> {
  const sent = await sentTodayCents(db, now);
  if (await balancePaused(db, now)) return { kind: "BALANCE", capCents, sentTodayCents: sent, resumesAt: null };
  const heldToday = await db.auditEvent.count({ where: { action: "PAYOUT_CAP_REACHED", createdAt: { gte: startOfUtcDay(now) } } });
  if (heldToday > 0) {
    const next = startOfUtcDay(now);
    next.setUTCDate(next.getUTCDate() + 1);
    return { kind: "CAP", capCents, sentTodayCents: sent, resumesAt: next.toISOString() };
  }
  return null;
}

/** Payments for one disruption that are accepted (PayPal chosen) but not sent yet. */
export async function queuedPayouts(db: PrismaClient, disruptionId: string): Promise<{ count: number; cents: number }> {
  const paypal = { offers: { some: { paymentChoice: "PAYPAL" as const, bankSwitchRequestedAt: null } }, payoutReceiver: { not: null } };
  const ents = await db.entitlement.findMany({
    where: { kind: { in: ["COMPENSATION", "MEAL_ALLOWANCE"] }, status: "ACCEPTED", amountCents: { gt: 0 }, passenger: { disruptionId, ...paypal }, payoutItems: { none: { status: { notIn: [...NO_MONEY] } } } },
    select: { amountCents: true },
  });
  const receipts = await db.receipt.findMany({
    where: { decision: { in: ["AUTO_APPROVED", "APPROVED_BY_HUMAN"] }, approvedCents: { gt: 0 }, passenger: { disruptionId, ...paypal }, payoutItems: { none: { status: { notIn: [...NO_MONEY] } } } },
    select: { approvedCents: true },
  });
  return { count: ents.length + receipts.length, cents: ents.reduce((s, e) => s + e.amountCents, 0) + receipts.reduce((s, r) => s + (r.approvedCents ?? 0), 0) };
}

const eur = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

/** What a duty manager or judge reads when payouts are held. */
export function holdMessage(hold: PayoutHold, queued: { count: number; cents: number }): string {
  const waiting = queued.count ? `${queued.count} payment${queued.count === 1 ? "" : "s"} (${eur(queued.cents)}) ${queued.count === 1 ? "is" : "are"} queued` : "New payments are queued";
  const rest = "Everything else in the demo still works: the evidence, the AI assessment, decisions, passenger pages, receipts, refunds and questions.";
  if (hold.kind === "BALANCE") {
    return `The demo's PayPal sandbox balance has run out: PayPal refused the last payout batch (insufficient funds). ${waiting} and go out once the balance is topped up; Groundside tries again after ${BALANCE_PAUSE_MINUTES} minutes or on Sync with PayPal. ${rest}`;
  }
  return `Today's demo payout limit is used up: ${eur(hold.sentTodayCents)} of ${eur(hold.capCents)} sent since 00:00 UTC, and the next payments do not fit in what is left. ${waiting} and go out after ${hold.resumesAt?.slice(11, 16)} UTC (${hold.resumesAt?.slice(0, 10)}) when Sync with PayPal is pressed. ${rest}`;
}
