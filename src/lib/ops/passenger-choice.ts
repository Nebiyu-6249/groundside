// A passenger's answer to their offer: how to be paid, and (for cancellations) refund or
// re-routing. Used by the passenger page and by the demo "simulate responses" control.

import type { PrismaClient } from "@/generated/prisma/client";
import { audit } from "./audit";
import { recomputeEntitlements } from "./engine-input";
import { requestPassengerRefund } from "./refunds";

// SPEC F8 wording, versioned and stored with the choice. The first sentence restates Art 7(3)
// (REG-7-3, VERIFIED); nothing asks the passenger to give up a further claim (Art 15).
export const CONSENT_VERSION = "consent.v2";
export const CONSENT_TEXT =
  "EU Regulation 261/2004 says compensation is paid in cash, by bank transfer, by bank order or by cheque. You can choose to receive it through PayPal instead. Choosing PayPal does not reduce your amount or any of your other rights, and you can choose bank transfer instead.";
export const CONSENT_CHECKBOX = "I choose to receive my payment through PayPal at the email address above.";
export const CONSENT_RULE = "REG-7-3";

export class ChoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChoiceError";
  }
}

export type PaymentChoiceInput =
  | { method: "PAYPAL"; paypalEmail: string; consent: boolean }
  | { method: "BANK_TRANSFER"; ibanLast4: string };

const PAYABLE = ["COMPENSATION", "MEAL_ALLOWANCE"] as const;

export async function recordPaymentChoice(db: PrismaClient, passengerId: string, input: PaymentChoiceInput, actor: "PASSENGER" | "SYSTEM") {
  const offer = await db.offer.findFirst({ where: { passengerId }, orderBy: { createdAt: "desc" } });
  if (!offer) throw new ChoiceError("No offer exists for this passenger yet.");
  if (offer.paymentChoice !== "NONE") throw new ChoiceError("A payment method was already chosen. Ask the airline to change it.");
  if (input.method === "PAYPAL" && !input.consent) throw new ChoiceError("Tick the consent box to be paid through PayPal.");
  if (input.method === "PAYPAL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.paypalEmail)) throw new ChoiceError("Enter the email address of your PayPal account.");
  if (input.method === "BANK_TRANSFER" && !/^[A-Za-z0-9]{4}$/.test(input.ibanLast4)) throw new ChoiceError("Enter the last 4 characters of your IBAN.");

  await db.$transaction([
    db.offer.update({
      where: { id: offer.id },
      data:
        input.method === "PAYPAL"
          ? { paymentChoice: "PAYPAL", paypalEmail: input.paypalEmail.trim(), consentTextVersion: CONSENT_VERSION, consentAt: new Date() }
          : { paymentChoice: "BANK_TRANSFER", ibanLast4: input.ibanLast4.toUpperCase() },
    }),
    db.entitlement.updateMany({ where: { passengerId, kind: { in: [...PAYABLE] }, status: { in: ["OFFERED", "READY"] } }, data: { status: "ACCEPTED" } }),
  ]);
  await audit(db, {
    actorType: actor,
    actorId: passengerId,
    action: input.method === "PAYPAL" ? "CHOSE_PAYPAL" : "CHOSE_BANK_TRANSFER",
    entityType: "Passenger",
    entityId: passengerId,
    summary: input.method === "PAYPAL" ? `Chose PayPal with consent (${CONSENT_VERSION})` : "Chose bank transfer (recorded only; handled outside this demo)",
  });
}

export async function recordTravelChoice(db: PrismaClient, passengerId: string, choice: "REROUTING" | "REFUND", actor: "PASSENGER" | "SYSTEM") {
  const p = await db.passenger.findUniqueOrThrow({ where: { id: passengerId }, select: { choice: true, disruptionId: true, disruption: { select: { type: true } } } });
  if (p.disruption.type !== "CANCELLATION") throw new ChoiceError("This choice is only offered for cancellations.");
  if (p.choice !== "UNDECIDED") throw new ChoiceError("You already chose. Ask the airline to change it.");
  await db.passenger.update({ where: { id: passengerId }, data: { choice } });
  await audit(db, { actorType: actor, actorId: passengerId, action: "TRAVEL_CHOICE", entityType: "Passenger", entityId: passengerId, summary: choice === "REFUND" ? "Chose a refund instead of re-routing" : "Chose re-routing" });
  // A refund ends care (Commission guidelines 2024, 4.3.1); the engine re-run applies it.
  await recomputeEntitlements(db, p.disruptionId, [passengerId]);
  if (choice === "REFUND") {
    try {
      await requestPassengerRefund(db, passengerId);
    } catch (err) {
      // PayPal unreachable: the choice stands; the refund can be retried from the ops console.
      await audit(db, { actorType: "SYSTEM", action: "REFUND_FAILED", entityType: "Passenger", entityId: passengerId, summary: `Refund request failed: ${err instanceof Error ? err.message : "unknown error"}` });
    }
  }
}
