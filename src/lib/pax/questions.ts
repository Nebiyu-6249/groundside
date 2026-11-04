// Passenger questions (SPEC F13, 8.4): builds the case file from stored data, asks A4, stores
// both messages, and opens a ticket when the passenger asks for a person.

import type { PrismaClient } from "@/generated/prisma/client";
import { aiConfig } from "@/lib/ai/config";
import { answerQuestion, type CaseFile } from "@/lib/ai/a4/answer";
import { openAiCaller } from "@/lib/ai/provider";
import { prismaSpendLog } from "@/lib/ai/spend";
import { audit } from "@/lib/ops/audit";
import { hit } from "@/lib/rate-limit";
import { loadRulePack } from "@/lib/rules/pack";

export const QUESTIONS_PER_DAY = 10;

export class QuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionError";
  }
}

const KIND: Record<string, string> = { COMPENSATION: "Compensation", MEAL_ALLOWANCE: "Meal allowance", HOTEL_REIMBURSEMENT_CAP: "Hotel, reimbursed up to", TRANSPORT_REIMBURSEMENT_CAP: "Airport-hotel transport, reimbursed up to", REFUND: "Ticket refund" };
const eur = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

export async function buildCaseFile(db: PrismaClient, passengerId: string): Promise<CaseFile> {
  const p = await db.passenger.findUniqueOrThrow({
    where: { id: passengerId },
    include: {
      entitlements: { include: { payoutItems: { where: { receiptId: null }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } } },
      offers: { orderBy: { createdAt: "desc" }, take: 1 },
      receipts: { orderBy: { createdAt: "asc" }, select: { decision: true, approvedCents: true, extracted: true } },
      booking: { select: { totalCents: true, paymentMethod: true, refunds: { take: 1, orderBy: { createdAt: "desc" }, select: { status: true } } } },
      disruption: { include: { flight: { include: { originAirport: true, destinationAirport: true } }, decisions: true } },
    },
  });
  const f = p.disruption.flight;
  const d = p.disruption.decisions[0];
  const amounts = new Set<number>([p.booking.totalCents]);
  const lines: string[] = [
    `Passenger first name: ${p.displayName.split(" ")[0]}. Demo data, fictional airline Demo Air.`,
    `Flight ${f.flightNumber} from ${f.originAirport.city} (${f.originAirport.iata}) to ${f.destinationAirport.city} (${f.destinationAirport.iata}), scheduled ${f.schedDep.toISOString().replace("T", " ").slice(0, 16)} UTC, ${p.disruption.type === "CANCELLATION" ? "cancelled" : "delayed"}.`,
    `Final destination of the booking: ${p.finalDestination}. Ticket price ${eur(p.booking.totalCents)}.`,
    !d ? "Compensation decision: not made yet; the airline is checking the cause." : d.kind === "APPROVE_COMPENSATION" ? "Compensation decision: approved by the duty manager." : `Compensation decision: denied by the duty manager. Reason given: ${d.reason} Rules relied on: ${d.citations.join(", ")}. Care (meals, hotel, transport) is not affected. The passenger may contest this with the airline or the national enforcement body in the country of departure.`,
    p.disruption.type === "CANCELLATION" ? `Travel choice: ${p.choice === "REFUND" ? "refund of the ticket" : p.choice === "REROUTING" ? "re-routing on the new flight" : "not chosen yet (refund or re-routing)"}.` : "",
    "Entitlements (computed by the engine):",
  ];
  for (const e of p.entitlements) {
    if (e.amountCents === 0 && e.status === "NOT_OWED") {
      lines.push(`- ${KIND[e.kind] ?? e.kind}: not owed. Why: ${(e.trace as { outcome: string }[]).map((s) => s.outcome).slice(-1)[0] ?? ""}`);
      continue;
    }
    amounts.add(e.amountCents);
    const trace = (e.trace as { ruleId: string; outcome: string }[]).map((s) => `${s.outcome} (${s.ruleId})`).join("; ");
    lines.push(`- ${KIND[e.kind] ?? e.kind}: ${eur(e.amountCents)}, status ${e.status.toLowerCase().replaceAll("_", " ")}${e.payoutItems[0] ? `, PayPal payout ${e.payoutItems[0].status.toLowerCase()}` : ""}. How it was calculated: ${trace}`);
  }
  const o = p.offers[0];
  lines.push(`Payment method: ${!o || o.paymentChoice === "NONE" ? "not chosen yet" : o.paymentChoice === "PAYPAL" ? `PayPal${o.bankSwitchRequestedAt ? " (switch to bank transfer requested; waits for the unclaimed PayPal payment to come back)" : ""}` : "bank transfer (handled outside this demo)"}.`);
  if (p.booking.refunds[0]) lines.push(`Refund to the original PayPal payment: ${p.booking.refunds[0].status.toLowerCase()}.`);
  if (p.receipts.length) {
    lines.push("Receipts:");
    for (const r of p.receipts) {
      const x = r.extracted as { merchantName?: string | null; total?: number | null } | null;
      if (x?.total) amounts.add(Math.round(x.total * 100));
      if (r.approvedCents) amounts.add(r.approvedCents);
      lines.push(`- ${x?.merchantName ?? "Receipt"}${x?.total ? ` ${x.total.toFixed(2)}` : ""}: ${r.decision === "AUTO_APPROVED" || r.decision === "APPROVED_BY_HUMAN" ? `approved ${eur(r.approvedCents ?? 0)}` : r.decision === "REJECTED" ? "not reimbursed" : "waiting for a person"}.`);
    }
  }
  lines.push("Meal, hotel and transport amounts are Demo Air policy, not set by law.");
  return { text: lines.filter(Boolean).join("\n"), amountsCents: [...amounts] };
}

export async function askQuestion(db: PrismaClient, passengerId: string, question: string) {
  const q = question.trim();
  if (q.length < 3) throw new QuestionError("Type a question.");
  if (q.length > 1000) throw new QuestionError("Keep the question under 1000 characters.");
  const limit = await hit(db, `qa:${passengerId}`, QUESTIONS_PER_DAY, 86_400);
  if (!limit.allowed) throw new QuestionError(`You can ask ${QUESTIONS_PER_DAY} questions a day. Use Talk to a person for anything else.`);
  const rules = loadRulePack()
    .filter((r) => r.status === "VERIFIED" && r.kind !== "GUIDANCE")
    .map((r) => ({ id: r.id, title: r.title, summary: r.summary }));
  const caseFile = await buildCaseFile(db, passengerId);
  const r = await answerQuestion(q, caseFile, rules, { config: aiConfig(), caller: process.env.OPENAI_API_KEY ? openAiCaller(process.env.OPENAI_API_KEY) : null, spend: prismaSpendLog(db) });
  await db.qaMessage.create({ data: { passengerId, role: "PASSENGER", text: q, validated: true } });
  const answer = r.output.citations.length ? `${r.output.answer}\n\nRules: ${r.output.citations.join(", ")}` : r.output.answer;
  await db.qaMessage.create({ data: { passengerId, role: "ASSISTANT", text: answer, validated: r.validated } });
  await audit(db, { actorType: "AI", action: "QA_ANSWERED", entityType: "Passenger", entityId: passengerId, summary: `A4 answered (${r.output.category.toLowerCase()}${r.validated ? "" : ", fallback"})${r.output.offerHuman ? "; offered a person" : ""}`, data: { model: r.model, retries: r.retries, errors: r.errors } });
  return { answer, offerHuman: r.output.offerHuman, category: r.output.category };
}

export async function talkToPerson(db: PrismaClient, passengerId: string, reason: string) {
  const open = await db.ticket.findFirst({ where: { passengerId, status: "OPEN" } });
  if (open) return { ticketId: open.id, created: false };
  const last = await db.qaMessage.findFirst({ where: { passengerId, role: "PASSENGER" }, orderBy: { createdAt: "desc" }, select: { text: true } });
  const t = await db.ticket.create({ data: { passengerId, reason: (reason.trim() || last?.text || "The passenger asked to talk to a person.").slice(0, 1000) } });
  await audit(db, { actorType: "PASSENGER", actorId: passengerId, action: "TICKET_OPENED", entityType: "Passenger", entityId: passengerId, summary: "Asked to talk to a person" });
  return { ticketId: t.id, created: true };
}
