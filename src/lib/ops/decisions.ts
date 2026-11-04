// Duty manager decisions (golden rule 2, SPEC 8.1): approval, or a signed denial with a typed
// name, a written reason and rule-pack citations. One decision per disruption (unique index),
// so a double click or replayed request cannot create a second one.

import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { citableIds, loadRulePack } from "@/lib/rules/pack";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "./audit";
import { recomputeEntitlements } from "./engine-input";
import { appBaseUrl } from "@/lib/app-url";

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

const OFFER_DAYS = 30;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

async function latestRecommendation(db: PrismaClient, disruptionId: string) {
  const a = await db.assessment.findFirst({ where: { disruptionId }, orderBy: { createdAt: "desc" }, select: { shownRecommendation: true } });
  return a?.shownRecommendation ?? null;
}

export async function approveCompensation(db: PrismaClient, user: SessionUser, disruptionId: string, differsReason?: string) {
  if (user.role !== "DUTY_MANAGER") throw new DecisionError("Only a duty manager can decide.");
  const existing = await db.decision.findUnique({ where: { disruptionId } });
  if (existing) return { decision: existing, created: false };
  const shown = await latestRecommendation(db, disruptionId);
  const differs = shown !== null && shown !== "PAY_COMPENSATION";
  if (differs && !differsReason?.trim()) throw new DecisionError("The AI did not recommend paying. Say briefly why you are approving.");
  let decision;
  try {
    decision = await db.decision.create({
      data: { disruptionId, kind: "APPROVE_COMPENSATION", userId: user.id, typedName: user.name, reason: differsReason?.trim() || "Compensation approved.", citations: [], differsFromAi: differs, differsReason: differs ? differsReason!.trim() : null },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { decision: (await db.decision.findUnique({ where: { disruptionId } }))!, created: false };
    throw err;
  }
  await afterDecision(db, user, disruptionId, "APPROVED", `${user.name} approved compensation${differs ? " (differs from the AI recommendation)" : ""}`, decision.id);
  return { decision, created: true };
}

export interface DenialInput {
  typedName: string;
  reason: string;
  citations: string[];
}

export function validateDenial(user: SessionUser, input: DenialInput, citable: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  if (input.typedName.trim().toLowerCase() !== user.name.trim().toLowerCase()) errors.push(`Type your name exactly as "${user.name}" to sign.`);
  if (input.reason.trim().length < 20) errors.push("Write a reason of at least 20 characters.");
  if (input.citations.length === 0) errors.push("Cite at least one rule from the rule pack.");
  for (const c of input.citations) if (!citable.has(c)) errors.push(`${c} is not a verified rule-pack entry.`);
  return errors;
}

export async function signDenial(db: PrismaClient, user: SessionUser, disruptionId: string, input: DenialInput) {
  if (user.role !== "DUTY_MANAGER") throw new DecisionError("Only a duty manager can decide.");
  const errors = validateDenial(user, input, citableIds(loadRulePack(), { includePolicy: false }));
  if (errors.length) throw new DecisionError(errors.join(" "));
  const existing = await db.decision.findUnique({ where: { disruptionId } });
  if (existing) return { decision: existing, created: false };
  const shown = await latestRecommendation(db, disruptionId);
  let decision;
  try {
    decision = await db.decision.create({
      data: {
        disruptionId, kind: "DENY_COMPENSATION", userId: user.id, typedName: input.typedName.trim(), reason: input.reason.trim(),
        citations: [...new Set(input.citations)], differsFromAi: shown !== null && shown !== "NO_COMPENSATION_HUMAN_MUST_DECIDE",
        differsReason: shown !== null && shown !== "NO_COMPENSATION_HUMAN_MUST_DECIDE" ? input.reason.trim() : null,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { decision: (await db.decision.findUnique({ where: { disruptionId } }))!, created: false };
    throw err;
  }
  await afterDecision(db, user, disruptionId, "DENIAL_SIGNED", `${user.name} signed a denial of compensation citing ${decision.citations.join(", ")}. Care is still provided.`, decision.id);
  return { decision, created: true };
}

async function afterDecision(db: PrismaClient, user: SessionUser, disruptionId: string, status: "APPROVED" | "DENIAL_SIGNED", summary: string, decisionId: string) {
  await db.disruption.update({ where: { id: disruptionId }, data: { status } });
  await audit(db, { actorType: "USER", actorId: user.id, action: status === "APPROVED" ? "DECISION_APPROVE" : "DECISION_DENY", entityType: "Disruption", entityId: disruptionId, summary, data: { decisionId } });
  const engine = await recomputeEntitlements(db, disruptionId);
  const offers = await createOffers(db, disruptionId);
  await audit(db, { actorType: "SYSTEM", action: "OFFERS_CREATED", entityType: "Disruption", entityId: disruptionId, summary: `Engine re-run (${engine.updated} updated, ${engine.conflicts} conflicts); ${offers.created} passenger offers sent to the simulated outbox` });
}

/**
 * One offer per passenger with something owed. The link token is random (32 bytes); only its
 * SHA-256 is stored on the offer. The link itself lives only in the simulated email (outbox).
 */
export async function createOffers(db: PrismaClient, disruptionId: string) {
  const passengers = await db.passenger.findMany({
    where: { disruptionId, offers: { none: {} } },
    include: { entitlements: true, disruption: { include: { flight: true } } },
    orderBy: { manifestIndex: "asc" },
  });
  let created = 0;
  for (const p of passengers) {
    const owed = p.entitlements.filter((e) => e.amountCents > 0 && e.status !== "NOT_OWED");
    if (owed.length === 0) continue;
    const token = randomBytes(32).toString("base64url");
    await db.offer.create({ data: { passengerId: p.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + OFFER_DAYS * 86_400_000) } });
    // Refund status follows the passenger choice (engine), so only payable entitlements move to OFFERED.
    await db.entitlement.updateMany({ where: { passengerId: p.id, status: "READY", kind: { not: "REFUND" } }, data: { status: "OFFERED" } });
    const link = `${appBaseUrl()}/p/${token}`;
    const f = p.disruption.flight;
    const header = p.displayEmail ? `To: ${p.displayEmail} (simulated email, not sent)` : "Not delivered: no email address on file. Ops can open the page from the passenger list.";
    await db.outboxMessage.create({
      data: {
        passengerId: p.id,
        kind: "NOTICE",
        renderedText: `${header}\n\nDear ${p.displayName},\n\nYour flight ${f.flightNumber} was ${p.disruption.type === "CANCELLATION" ? "cancelled" : "delayed"}. Your personal page explains what you are entitled to and how to get paid:\n${link}\n\nDemo Air (fictional carrier). Demo data.`,
      },
    });
    created++;
  }
  return { created };
}

/** The passenger link from the latest simulated email, for "Open as passenger". */
export async function passengerLink(db: PrismaClient, passengerId: string): Promise<string | null> {
  const msg = await db.outboxMessage.findFirst({ where: { passengerId, kind: "NOTICE" }, orderBy: { createdAt: "desc" } });
  const m = msg?.renderedText.match(/https?:\/\/\S+\/p\/[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}
