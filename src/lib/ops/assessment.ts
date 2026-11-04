// Runs A1 for a stored disruption and saves the result (SPEC 8.1, 8.5).

import type { PrismaClient } from "@/generated/prisma/client";
import { aiConfig } from "@/lib/ai/config";
import { assessCause, loadA1Fixture, type A1Input } from "@/lib/ai/a1/assess";
import { openAiCaller } from "@/lib/ai/provider";
import { prismaSpendLog } from "@/lib/ai/spend";
import { loadRulePack } from "@/lib/rules/pack";
import { audit } from "./audit";

export async function a1InputFor(db: PrismaClient, disruptionId: string): Promise<A1Input> {
  const d = await db.disruption.findUniqueOrThrow({ where: { id: disruptionId }, include: { flight: { include: { previousFlight: true } }, facts: { orderBy: [{ observedAt: "asc" }, { id: "asc" }] }, evidence: true } });
  const p = d.flight.previousFlight;
  return {
    key: `scenario-${d.scenarioKey}`,
    disruption: {
      flightNumber: d.flight.flightNumber,
      origin: d.flight.origin,
      destination: d.flight.destination,
      type: d.type,
      schedDepUtc: d.flight.schedDep.toISOString(),
      schedArrUtc: d.flight.schedArr.toISOString(),
      informedAtUtc: d.informedAt?.toISOString() ?? null,
      previousFlight: p ? { flightNumber: p.flightNumber, origin: p.origin, destination: p.destination, schedDepUtc: p.schedDep.toISOString(), schedArrUtc: p.schedArr.toISOString() } : null,
    },
    opsNote: d.opsNote,
    maintenanceLog: d.maintenanceLog ?? "",
    otherEvidence: d.evidence.filter((e) => e.kind === "OTHER").map((e) => ({ name: "other_evidence", text: e.raw })),
    facts: d.facts.map((f) => ({ id: f.id, text: f.text })),
    tafAvailable: d.evidence.some((e) => e.kind === "TAF"),
  };
}

export async function runAssessment(db: PrismaClient, disruptionId: string, actor: { type: "USER" | "SYSTEM"; id?: string }) {
  const config = aiConfig();
  const input = await a1InputFor(db, disruptionId);
  const r = await assessCause(input, {
    config,
    caller: config.apiKey ? openAiCaller(config.apiKey) : null,
    spend: prismaSpendLog(db),
    rules: loadRulePack(),
    fixture: loadA1Fixture(input.key),
  });
  const saved = await db.assessment.create({
    data: {
      disruptionId,
      component: "A1",
      model: r.model,
      promptVersion: r.promptVersion,
      inputHash: r.inputHash,
      output: JSON.parse(JSON.stringify({ assessment: r.output, rawFailedOutput: r.rawFailedOutput, notice: r.notice })),
      validation: JSON.parse(JSON.stringify(r.validation)),
      shownRecommendation: r.shownRecommendation,
      modelRecommendation: r.modelRecommendation,
      retries: r.retries,
      usedFixture: r.usedFixture,
      costUsd: r.costUsd,
      latencyMs: r.latencyMs,
    },
  });
  await db.disruption.updateMany({ where: { id: disruptionId, status: { in: ["DRAFT", "EVIDENCE_READY"] } }, data: { status: "ASSESSED" } });
  await audit(db, {
    actorType: "AI",
    actorId: actor.id,
    action: "A1_ASSESSED",
    entityType: "Disruption",
    entityId: disruptionId,
    summary: `AI recommendation: ${r.shownRecommendation}${r.usedFixture ? " (cached result)" : ""}${r.disagreement ? `; model's own label was ${r.modelRecommendation}` : ""}`,
    data: { assessmentId: saved.id, model: r.model, promptVersion: r.promptVersion, costUsd: r.costUsd },
  });
  return saved;
}
