"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { ChoiceError, recordPaymentChoice, recordTravelChoice } from "@/lib/ops/passenger-choice";
import { offerByToken } from "@/lib/pax/offer";
import { payDisruption } from "@/lib/payouts/orchestrator";
import { hit } from "@/lib/rate-limit";
import { ipHash } from "@/lib/request";

export interface PaxState {
  error: string | null;
  ok?: string | null;
}

async function resolve(token: string) {
  const db = getDb();
  const limit = await hit(db, `pax:${await ipHash()}`, 60, 3600);
  if (!limit.allowed) throw new ChoiceError("Too many requests. Try again in an hour.");
  const view = await offerByToken(db, token);
  if (!view) throw new ChoiceError("This link is not valid or has expired.");
  return { db, view };
}

export async function choosePayment(token: string, _prev: PaxState, form: FormData): Promise<PaxState> {
  try {
    const { db, view } = await resolve(token);
    const method = form.get("method");
    if (method === "PAYPAL") {
      await recordPaymentChoice(db, view.passengerId, { method: "PAYPAL", paypalEmail: String(form.get("paypalEmail") ?? ""), consent: form.get("consent") === "yes" }, "PASSENGER");
      const disruptionId = (await db.passenger.findUniqueOrThrow({ where: { id: view.passengerId }, select: { disruptionId: true } })).disruptionId;
      // Pay right after the response is sent, so the passenger sees progress within seconds.
      after(async () => {
        await payDisruption(db, disruptionId);
      });
    } else if (method === "BANK_TRANSFER") {
      await recordPaymentChoice(db, view.passengerId, { method: "BANK_TRANSFER", ibanLast4: String(form.get("ibanLast4") ?? "") }, "PASSENGER");
    } else {
      return { error: "Choose PayPal or bank transfer." };
    }
  } catch (err) {
    if (err instanceof ChoiceError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/p/${token}`);
  return { error: null, ok: "Thank you. Your choice is saved." };
}

export async function chooseTravel(token: string, _prev: PaxState, form: FormData): Promise<PaxState> {
  try {
    const { db, view } = await resolve(token);
    const choice = form.get("travel");
    if (choice !== "REROUTING" && choice !== "REFUND") return { error: "Choose re-routing or a refund." };
    await recordTravelChoice(db, view.passengerId, choice, "PASSENGER");
  } catch (err) {
    if (err instanceof ChoiceError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/p/${token}`);
  return { error: null, ok: "Saved." };
}
