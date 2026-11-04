"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clearSession, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runAssessment } from "@/lib/ops/assessment";
import { approveCompensation, DecisionError, passengerLink, releaseCare, signDenial } from "@/lib/ops/decisions";
import { payDisruption } from "@/lib/payouts/orchestrator";
import { audit } from "@/lib/ops/audit";
import { loadReadiness } from "@/lib/ops/readiness";
import { refreshRefunds, requestPassengerRefund } from "@/lib/ops/refunds";
import { cancelUnclaimed, sendReminder, UnclaimedError } from "@/lib/payouts/unclaimed";
import { ReceiptError, reviewReceipt } from "@/lib/receipts/service";
import { reconcileDisruption } from "@/lib/payouts/reconcile";
import { hit } from "@/lib/rate-limit";

export interface ActionState {
  error: string | null;
  ok?: string | null;
}

const id = z.string().min(1).max(64);

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function assess(disruptionId: string): Promise<ActionState> {
  const user = await requireUser("DUTY_MANAGER");
  const db = getDb();
  const limit = await hit(db, `assess:${disruptionId}`, 5, 3600);
  if (!limit.allowed) return { error: "The AI assessment can run 5 times an hour per disruption. Try again later." };
  await runAssessment(db, id.parse(disruptionId), { type: "USER", id: user.id });
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Assessment updated." };
}

export async function approve(disruptionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("DUTY_MANAGER");
  const db = getDb();
  // SPEC F6: the Readiness panel is all green, or the duty manager acknowledges what is open.
  const open = (await loadReadiness(db, id.parse(disruptionId))).filter((c) => !c.ok);
  if (open.length && form.get("acknowledge") !== "on") return { error: `Acknowledge the open readiness checks first: ${open.map((c) => c.label).join(", ")}.` };
  try {
    const r = await approveCompensation(db, user, disruptionId, String(form.get("differsReason") ?? ""));
    if (r.created && open.length) {
      await audit(db, { actorType: "USER", actorId: user.id, action: "READINESS_ACKNOWLEDGED", entityType: "Disruption", entityId: disruptionId, summary: `${user.name} approved with open readiness checks: ${open.map((c) => `${c.label} (${c.detail})`).join("; ")}` });
    }
  } catch (err) {
    if (err instanceof DecisionError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: "Approved. Passenger offers are in the outbox." };
}

export async function deny(disruptionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("DUTY_MANAGER");
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
  const user = await requireUser("DUTY_MANAGER");
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
  await requireUser();
  const db = getDb();
  await payDisruption(db, id.parse(disruptionId));
  const r = await reconcileDisruption(db, disruptionId, { force: true });
  const refunds = await refreshRefunds(db, disruptionId);
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: `Synced with PayPal: ${r.changed + refunds} change(s).` };
}

export async function remindUnclaimed(disruptionId: string, payoutItemId: string): Promise<ActionState> {
  const user = await requireUser("DUTY_MANAGER");
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
  const user = await requireUser("DUTY_MANAGER");
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
  const user = await requireUser("DUTY_MANAGER");
  const db = getDb();
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

export async function retryRefund(disruptionId: string, passengerId: string): Promise<ActionState> {
  await requireUser("DUTY_MANAGER");
  const db = getDb();
  const p = await db.passenger.findFirst({ where: { id: id.parse(passengerId), disruptionId: id.parse(disruptionId), choice: "REFUND" }, select: { id: true } });
  if (!p) return { error: "This passenger has not chosen a refund." };
  const r = await requestPassengerRefund(db, p.id);
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: r === "REQUESTED" ? "Refund requested from PayPal." : r === "OUTSIDE_DEMO" ? "Recorded: refund to the original payment method, outside this demo." : "No refund is owed." };
}

export async function openAsPassenger(passengerId: string) {
  await requireUser();
  const link = await passengerLink(getDb(), id.parse(passengerId));
  if (!link) redirect("/ops?error=no-offer");
  redirect(new URL(link).pathname);
}

/**
 * Demo control (SPEC 14): passengers who have not answered respond as scripted. PayPal for
 * most, bank transfer for the scripted ones; then payouts start in the background.
 */
export async function simulateResponses(disruptionId: string): Promise<ActionState> {
  await requireUser("DUTY_MANAGER");
  const db = getDb();
  const { simulatePassengerResponses } = await import("@/lib/ops/simulate");
  const n = await simulatePassengerResponses(db, id.parse(disruptionId));
  after(async () => {
    await payDisruption(db, disruptionId);
  });
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: `${n} passenger(s) responded. Payouts are being sent.` };
}
