// Passenger notices after a decision (SPEC F7, 8.3): one notice per disruption and outcome,
// written by A3 with placeholders or, when live AI is unavailable, by a code template. Cached by
// (disruption, outcome, prompt version). Code fills every name, amount and link per passenger.

import type { PrismaClient } from "@/generated/prisma/client";
import { aiConfig } from "@/lib/ai/config";
import { A3_PROMPT_VERSION, fillNotice, writeNotice, type NoticeOutcome, type Placeholder } from "@/lib/ai/a3/notice";
import { openAiCaller } from "@/lib/ai/provider";
import { prismaSpendLog } from "@/lib/ai/spend";
import { loadRulePack } from "@/lib/rules/pack";
import { displayTitle } from "@/lib/rules/display";

export const TEMPLATE_VERSION = "template.v1";
const NOTICE_RULES = ["REG-5-1-A", "REG-5-1-B", "REG-5-3", "REG-6-1", "REG-7-1", "REG-8-1", "REG-9-1", "REG-14-2", "REG-15"];

const TEMPLATES: Record<NoticeOutcome, string> = {
  COMPENSATION_APPROVED: "Dear {{PASSENGER_NAME}},\n\nWe are sorry your flight was disrupted. You are owed compensation of {{COMPENSATION_AMOUNT}}. You also receive meals and drinks while you wait, and a hotel and transport if you need to stay overnight.\n\nOpen your personal page to choose how to be paid and to see how each amount was worked out: {{CLAIM_LINK}}\n\nDemo Air (fictional carrier). Demo data.",
  COMPENSATION_DENIED_WITH_CARE: "Dear {{PASSENGER_NAME}},\n\nWe are sorry your flight was disrupted. Compensation is not being paid. The reason: {{DECISION_REASON}}\n\nMeals and drinks while you wait, and a hotel and transport if you need to stay overnight, are still provided. You can contest this decision with the airline or with the national enforcement body in the country of departure.\n\nYour personal page has the details and lets you choose how to be paid: {{CLAIM_LINK}}\n\nDemo Air (fictional carrier). Demo data.",
  CARE_ONLY: "Dear {{PASSENGER_NAME}},\n\nWe are sorry your flight was disrupted. No compensation is owed for this disruption, but you receive meals and drinks while you wait, and a hotel and transport if you need to stay overnight.\n\nYour personal page has the details and lets you choose how to be paid: {{CLAIM_LINK}}\n\nDemo Air (fictional carrier). Demo data.",
};

export function outcomeFor(decisionKind: string | null, compensationCents: number): NoticeOutcome {
  if (decisionKind === "DENY_COMPENSATION") return "COMPENSATION_DENIED_WITH_CARE";
  return compensationCents > 0 ? "COMPENSATION_APPROVED" : "CARE_ONLY";
}

/** The notice for this disruption and outcome, written once and reused. */
export async function noticeFor(db: PrismaClient, disruptionId: string, outcome: NoticeOutcome) {
  const cached = await db.notice.findFirst({ where: { disruptionId, outcome, promptVersion: { in: [A3_PROMPT_VERSION, TEMPLATE_VERSION] } }, orderBy: { createdAt: "desc" } });
  if (cached) return cached;
  const d = await db.disruption.findUniqueOrThrow({ where: { id: disruptionId }, include: { flight: { include: { originAirport: true, destinationAirport: true } } } });
  const rules = loadRulePack().filter((r) => NOTICE_RULES.includes(r.id) && r.status === "VERIFIED").map((r) => ({ id: r.id, title: displayTitle(r), summary: r.summary }));
  const ai = await writeNotice(
    { outcome, flight: { number: d.flight.flightNumber, origin: d.flight.originAirport.city, destination: d.flight.destinationAirport.city, type: d.type }, rules },
    { config: aiConfig(), caller: process.env.OPENAI_API_KEY ? openAiCaller(process.env.OPENAI_API_KEY) : null, spend: prismaSpendLog(db) },
  ).catch(() => null);
  return db.notice.create({
    data: ai
      ? { disruptionId, outcome, promptVersion: A3_PROMPT_VERSION, text: ai.text, citations: ai.citations }
      : { disruptionId, outcome, promptVersion: TEMPLATE_VERSION, text: TEMPLATES[outcome], citations: [] },
  });
}

const eur = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

/** Fills a notice for one passenger. */
export function renderNotice(text: string, v: { name: string; compensationCents: number; mealCents: number; link: string; decisionReason: string | null }): string {
  const values: Partial<Record<Placeholder, string>> = {
    PASSENGER_NAME: v.name,
    COMPENSATION_AMOUNT: eur(v.compensationCents),
    MEAL_ALLOWANCE: eur(v.mealCents),
    CLAIM_LINK: v.link,
    DECISION_REASON: v.decisionReason ?? "",
  };
  return fillNotice(text, values);
}
