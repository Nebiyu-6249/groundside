// Unclaimed payouts (SPEC F10, 9.7). PayPal holds a payout to an email without an account for 30
// days, then returns it. Ops can remind the passenger or cancel the item; the passenger can switch
// to bank transfer, which completes only once the item is cancelled or returned, so nobody is
// ever paid twice. The sandbox refused every cancel in Phase 0 (HTTP 500), so a failed cancel is
// recorded honestly and the switch waits for PayPal's automatic return.

import type { PrismaClient } from "@/generated/prisma/client";
import { audit } from "@/lib/ops/audit";
import { paypalAccount } from "@/lib/paypal/account";
import { cancelPayoutItem, getPayoutItem, payoutItemSchema } from "@/lib/paypal/payouts";
import { applyItemUpdate, NO_MONEY } from "./transitions";

export const UNCLAIMED_DAYS = 30;

export class UnclaimedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnclaimedError";
  }
}

const eur = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

async function unclaimedItem(db: PrismaClient, payoutItemId: string) {
  const item = await db.payoutItem.findUnique({ where: { id: payoutItemId }, include: { entitlement: { include: { passenger: true } } } });
  if (!item || item.status !== "UNCLAIMED") throw new UnclaimedError("This payout is not unclaimed.");
  const batch = await db.payoutBatch.findUnique({ where: { id: item.batchId }, select: { paypalAccount: true } });
  if (batch?.paypalAccount !== paypalAccount()) throw new UnclaimedError("This payout was made with an earlier PayPal sandbox app and is archived.");
  return item;
}

/** A reminder in the simulated outbox, at most one per passenger per day. */
export async function sendReminder(db: PrismaClient, payoutItemId: string, actorId: string) {
  const item = await unclaimedItem(db, payoutItemId);
  const p = item.entitlement.passenger;
  const since = new Date(Date.now() - 86_400_000);
  if (await db.outboxMessage.count({ where: { passengerId: p.id, kind: "REMINDER", createdAt: { gte: since } } })) {
    throw new UnclaimedError("A reminder was already sent to this passenger in the last 24 hours.");
  }
  const deadline = new Date(item.createdAt.getTime() + UNCLAIMED_DAYS * 86_400_000).toISOString().slice(0, 10);
  const header = p.displayEmail ? `To: ${p.displayEmail} (simulated email, not sent)` : "Not delivered: no email address on file.";
  await db.outboxMessage.create({
    data: {
      passengerId: p.id,
      kind: "REMINDER",
      renderedText: `${header}\n\nDear ${p.displayName},\n\nYour payment of ${eur(item.amountCents)} is waiting in PayPal for ${item.receiver}. To collect it, create or log in to a PayPal account with that email address by ${deadline}. If you prefer a bank transfer, choose it on your personal page (link in our first email).\n\nDemo Air (fictional carrier). Demo data.`,
    },
  });
  await audit(db, { actorType: "USER", actorId, action: "UNCLAIMED_REMINDER", entityType: "PayoutItem", entityId: item.id, summary: `Reminder sent to ${p.displayName} about an unclaimed payout of ${eur(item.amountCents)}` });
}

/** Asks PayPal to cancel an unclaimed item and applies what PayPal reports. */
export async function cancelUnclaimed(db: PrismaClient, payoutItemId: string, actor: { type: "USER" | "PASSENGER" | "SYSTEM"; id?: string }): Promise<{ cancelled: boolean; message: string }> {
  const item = await unclaimedItem(db, payoutItemId);
  if (!item.paypalItemId) throw new UnclaimedError("PayPal has not assigned an item ID yet.");
  const res = await cancelPayoutItem(item.paypalItemId);
  if (res.ok) {
    const parsed = payoutItemSchema.safeParse(res.data);
    const status = parsed.success ? parsed.data.transaction_status : undefined;
    // Re-read if the cancel answer carries no status.
    const after = status ?? payoutItemSchema.safeParse((await getPayoutItem(item.paypalItemId)).data).data?.transaction_status;
    if (after) await applyItemUpdate(db, { paypalItemId: item.paypalItemId, status: after }, "POLL");
    await audit(db, { actorType: actor.type, actorId: actor.id ?? null, action: "PAYOUT_CANCEL", entityType: "PayoutItem", entityId: item.id, summary: `Cancel of unclaimed payout accepted by PayPal (${after ?? "status pending"})`, data: { debugId: res.debugId } });
    return { cancelled: true, message: "PayPal accepted the cancel. The money returns to the airline." };
  }
  await audit(db, { actorType: actor.type, actorId: actor.id ?? null, action: "PAYOUT_CANCEL_UNAVAILABLE", entityType: "PayoutItem", entityId: item.id, summary: `PayPal did not accept the cancel (HTTP ${res.status}, debug ${res.debugId ?? "-"}). The item returns automatically after ${UNCLAIMED_DAYS} days unclaimed.`, data: { debugId: res.debugId, status: res.status } });
  return { cancelled: false, message: `PayPal did not accept the cancel (HTTP ${res.status}; the sandbox refused every cancel in our tests). The payment returns to the airline automatically after ${UNCLAIMED_DAYS} days unclaimed, and the bank transfer follows then.` };
}

/**
 * The passenger asks to switch to bank transfer. The PayPal choice stays recorded until every
 * PayPal item for them is final without money (cancelled or returned); finalizeBankSwitches then
 * records the bank transfer. Until then the orchestrator sends nothing new to PayPal for them.
 */
export async function requestBankSwitch(db: PrismaClient, passengerId: string, ibanLast4: string): Promise<{ cancelled: boolean; message: string }> {
  if (!/^[A-Za-z0-9]{4}$/.test(ibanLast4)) throw new UnclaimedError("Enter the last 4 characters of your IBAN.");
  const offer = await db.offer.findFirst({ where: { passengerId }, orderBy: { createdAt: "desc" } });
  if (!offer || offer.paymentChoice !== "PAYPAL") throw new UnclaimedError("Only a PayPal payment can be switched to bank transfer.");
  const items = await db.payoutItem.findMany({ where: { status: "UNCLAIMED", entitlement: { passengerId }, batch: { paypalAccount: paypalAccount() } } });
  if (items.length === 0) throw new UnclaimedError("You have no unclaimed PayPal payment to switch.");
  if (!offer.bankSwitchRequestedAt) {
    await db.offer.update({ where: { id: offer.id }, data: { bankSwitchRequestedAt: new Date(), ibanLast4: ibanLast4.toUpperCase() } });
    await audit(db, { actorType: "PASSENGER", actorId: passengerId, action: "BANK_SWITCH_REQUESTED", entityType: "Passenger", entityId: passengerId, summary: "Asked to switch an unclaimed PayPal payout to bank transfer" });
  }
  let cancelled = true;
  let message = "";
  for (const item of items) {
    const r = await cancelUnclaimed(db, item.id, { type: "PASSENGER", id: passengerId });
    cancelled &&= r.cancelled;
    message = r.message;
  }
  await finalizeBankSwitches(db, (await db.passenger.findUniqueOrThrow({ where: { id: passengerId }, select: { disruptionId: true } })).disruptionId);
  return { cancelled, message };
}

/** Completes requested switches whose PayPal items are all final without money. */
export async function finalizeBankSwitches(db: PrismaClient, disruptionId: string): Promise<number> {
  const offers = await db.offer.findMany({
    where: { paymentChoice: "PAYPAL", bankSwitchRequestedAt: { not: null }, passenger: { disruptionId } },
    include: { passenger: { include: { entitlements: { include: { payoutItems: { select: { status: true } } } } } } },
  });
  let done = 0;
  for (const o of offers) {
    const items = o.passenger.entitlements.flatMap((e) => e.payoutItems);
    // Every item is either paid (kept) or returned without money; none still pending or unclaimed.
    if (!items.every((i) => i.status === "SUCCESS" || NO_MONEY.has(i.status))) continue;
    await db.offer.update({ where: { id: o.id }, data: { paymentChoice: "BANK_TRANSFER" } });
    await audit(db, { actorType: "SYSTEM", action: "CHOSE_BANK_TRANSFER", entityType: "Passenger", entityId: o.passengerId, summary: "Switched to bank transfer after the unclaimed PayPal payout was returned (recorded only; handled outside this demo)" });
    done++;
  }
  return done;
}
