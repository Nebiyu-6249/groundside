"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertDisruptionAccess, assertPassengerAccess } from "@/lib/auth/scope";
import { clearSession, requireUser, type SessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runAssessment } from "@/lib/ops/assessment";
import { approveCompensation, DecisionError, passengerLink, releaseCare, signDenial } from "@/lib/ops/decisions";
import { payDisruption, payoutSettings } from "@/lib/payouts/orchestrator";
import { approvalCostCents, costConfirmationPhrase } from "@/lib/ops/approval-cost";
import { audit } from "@/lib/ops/audit";
import { loadReadiness } from "@/lib/ops/readiness";
import { refreshRefunds, requestPassengerRefund } from "@/lib/ops/refunds";
import { cancelUnclaimed, sendReminder, UnclaimedError } from "@/lib/payouts/unclaimed";
import { ReceiptError, reviewReceipt } from "@/lib/receipts/service";
import { reconcileDisruption } from "@/lib/payouts/reconcile";
import { hit } from "@/lib/rate-limit";
import { JudgeError, resetJudgeRun } from "@/lib/judge/run";

export interface ActionState {
  error: string | null;
  ok?: string | null;
}

const id = z.string().min(1).max(64);

/**
 * Signed in (with the role, if given) and allowed to see this disruption: a judge only their own
 * run (SPEC 13). Every action that takes a disruption ID goes through here.
 */
async function authorize(disruptionId: string, role?: SessionUser["role"]): Promise<SessionUser> {
  const user = await requireUser(role);
  await assertDisruptionAccess(getDb(), user, id.parse(disruptionId));
  return user;
}

/** The payout item, receipt or passenger must belong to the disruption named in the action. */
async function belongs(kind: "payoutItem" | "receipt", itemId: string, disruptionId: string): Promise<boolean> {
  const db = getDb();
  const n = kind === "payoutItem"
    ? await db.payoutItem.count({ where: { id: id.parse(itemId), entitlement: { passenger: { disruptionId } } } })
    : await db.receipt.count({ where: { id: id.parse(itemId), passenger: { disruptionId } } });
  return n > 0;
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function assess(disruptionId: string): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  const db = getDb();
  const limit = await hit(db, `assess:${disruptionId}`, 5, 3600);
  if (!limit.allowed) return { error: "The AI assessment can run 5 times an hour per disruption. Try again later." };
  await runAssessment(db, id.parse(disruptionId), { type: "USER", id: user.id });
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Assessment updated." };
}

export async function approve(disruptionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  const db = getDb();
  if (String(form.get("confirm") ?? "").trim() !== "APPROVE") return { error: "Type APPROVE to confirm." };
  // SPEC F6: the Readiness panel is all green, or the duty manager acknowledges what is open.
  const open = (await loadReadiness(db, id.parse(disruptionId))).filter((c) => !c.ok);
  if (open.length && form.get("acknowledge") !== "on") return { error: `Acknowledge the open readiness checks first: ${open.map((c) => c.label).join(", ")}.` };
  // A large run (above one day's payout cap) needs its cost typed (owner decision 2026-11-06).
  const ents = await db.entitlement.findMany({ where: { passenger: { disruptionId: id.parse(disruptionId) } }, select: { kind: true, amountCents: true, status: true } });
  const phrase = costConfirmationPhrase(approvalCostCents(ents), payoutSettings().dailyCapCents);
  if (phrase && String(form.get("confirmCost") ?? "").trim() !== phrase) return { error: `This approval costs more than one day's payout cap. Type ${phrase} to confirm the cost.` };
  try {
    const r = await approveCompensation(db, user, disruptionId, String(form.get("differsReason") ?? ""));
    if (r.created && open.length) {
      await audit(db, { actorType: "USER", actorId: user.id, action: "READINESS_ACKNOWLEDGED", entityType: "Disruption", entityId: disruptionId, summary: `${user.name} approved with open readiness checks: ${open.map((c) => `${c.label} (${c.detail})`).join("; ")}` });
    }
  } catch (err) {
    if (err instanceof DecisionError) return { error: err.message };
    throw err;
  }
  // Passengers who already chose PayPal (care released first) are paid at once.
  after(async () => void (await payDisruption(db, disruptionId)));
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Approved. Passenger offers are in the outbox." };
}

export async function deny(disruptionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  try {
    await signDenial(getDb(), user, id.parse(disruptionId), {
      typedName: String(form.get("typedName") ?? ""),
      reason: String(form.get("reason") ?? ""),
      citations: form.getAll("citations").map(String),
    });
  } catch (err) {
    if (err instanceof DecisionError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Denial signed. Care is still provided." };
}

export async function releaseCareNow(disruptionId: string): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  let r;
  try {
    r = await releaseCare(getDb(), user, id.parse(disruptionId));
  } catch (err) {
    if (err instanceof DecisionError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: r.released ? `Meal allowances released. ${r.offers} passenger offers are in the outbox.` : "Meal allowances were already released." };
}

export async function syncWithPaypal(disruptionId: string): Promise<ActionState> {
  await authorize(disruptionId);
  const db = getDb();
  await payDisruption(db, id.parse(disruptionId));
  const r = await reconcileDisruption(db, disruptionId, { force: true });
  const refunds = await refreshRefunds(db, disruptionId);
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: `Synced with PayPal: ${r.changed + refunds} change(s).` };
}

export async function remindUnclaimed(disruptionId: string, payoutItemId: string): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  if (!(await belongs("payoutItem", payoutItemId, disruptionId))) return { error: "This payout is not on this flight." };
  try {
    await sendReminder(getDb(), id.parse(payoutItemId), user.id);
  } catch (err) {
    if (err instanceof UnclaimedError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Reminder is in the outbox." };
}

export async function cancelUnclaimedItem(disruptionId: string, payoutItemId: string): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  if (!(await belongs("payoutItem", payoutItemId, disruptionId))) return { error: "This payout is not on this flight." };
  let r;
  try {
    r = await cancelUnclaimed(getDb(), id.parse(payoutItemId), { type: "USER", id: user.id });
  } catch (err) {
    if (err instanceof UnclaimedError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return r.cancelled ? { error: null, ok: r.message } : { error: r.message };
}

export async function decideReceipt(disruptionId: string, receiptId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  const db = getDb();
  if (!(await belongs("receipt", receiptId, disruptionId))) return { error: "This receipt is not on this flight." };
  const approveIt = form.get("decision") === "approve";
  let r;
  try {
    r = await reviewReceipt(db, user, id.parse(receiptId), approveIt, String(form.get("reason") ?? ""));
  } catch (err) {
    if (err instanceof ReceiptError) return { error: err.message };
    throw err;
  }
  if (approveIt) after(async () => void (await payDisruption(db, disruptionId)));
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: approveIt ? `Approved ${(r.approvedCents / 100).toFixed(2)} EUR; payment follows if the passenger chose PayPal.` : "Rejected." };
}

export async function closeTicket(disruptionId: string, ticketId: string): Promise<ActionState> {
  const user = await authorize(disruptionId, "DUTY_MANAGER");
  const db = getDb();
  const t = await db.ticket.updateMany({ where: { id: id.parse(ticketId), status: "OPEN", passenger: { disruptionId: id.parse(disruptionId) } }, data: { status: "CLOSED" } });
  if (t.count) await audit(db, { actorType: "USER", actorId: user.id, action: "TICKET_CLOSED", entityType: "Disruption", entityId: disruptionId, summary: `${user.name} closed a passenger ticket` });
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Ticket closed." };
}

export async function retryRefund(disruptionId: string, passengerId: string): Promise<ActionState> {
  await authorize(disruptionId, "DUTY_MANAGER");
  const db = getDb();
  const p = await db.passenger.findFirst({ where: { id: id.parse(passengerId), disruptionId: id.parse(disruptionId), choice: "REFUND" }, select: { id: true } });
  if (!p) return { error: "This passenger has not chosen a refund." };
  const r = await requestPassengerRefund(db, p.id);
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: r === "REQUESTED" ? "Refund requested from PayPal." : r === "OUTSIDE_DEMO" ? "Recorded: refund to the original payment method, outside this demo." : "No refund is owed." };
}

/** Judge mode: "Reset this run" gives the judge a fresh copy of their scenario (SPEC 14). */
export async function resetRun(): Promise<ActionState> {
  const user = await requireUser("DUTY_MANAGER");
  if (!user.judgeRunId) return { error: "Only a judge demo can be reset here. The owner resets with npm run reset-demo." };
  let disruptionId: string;
  try {
    disruptionId = await resetJudgeRun(getDb(), user.judgeRunId);
  } catch (err) {
    if (err instanceof JudgeError) return { error: err.message };
    throw err;
  }
  redirect(`/ops/disruptions/${disruptionId}?tab=evidence`);
}

export async function openAsPassenger(passengerId: string) {
  const user = await requireUser();
  await assertPassengerAccess(getDb(), user, id.parse(passengerId));
  const link = await passengerLink(getDb(), id.parse(passengerId));
  if (!link) redirect("/ops?error=no-offer");
  redirect(new URL(link).pathname);
}

/**
 * Demo control (SPEC 14): passengers who have not answered respond as scripted. PayPal for
 * most, bank transfer for the scripted ones; then payouts start in the background.
 */
export async function simulateResponses(disruptionId: string): Promise<ActionState> {
  await authorize(disruptionId, "DUTY_MANAGER");
  const db = getDb();
  const { simulatePassengerResponses } = await import("@/lib/ops/simulate");
  const n = await simulatePassengerResponses(db, id.parse(disruptionId));
  after(async () => {
    await payDisruption(db, disruptionId);
  });
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: `${n} passenger(s) responded. Payouts are being sent.` };
}
