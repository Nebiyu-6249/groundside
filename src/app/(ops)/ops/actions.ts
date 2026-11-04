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
  try {
    await approveCompensation(getDb(), user, id.parse(disruptionId), String(form.get("differsReason") ?? ""));
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
  revalidatePath(`/ops/disruptions/${disruptionId}`);
  return { error: null, ok: `Synced with PayPal: ${r.changed} change(s).` };
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
