// Read models for the ops console. Everything returned here is plain, serialisable data.

import type { PrismaClient } from "@/generated/prisma/client";
import type { A1Output } from "@/lib/ai/a1/schema";
import { loadRulePack } from "@/lib/rules/pack";

export async function boardRows(db: PrismaClient) {
  const ds = await db.disruption.findMany({
    where: { judgeRunId: null },
    orderBy: { createdAt: "asc" },
    include: {
      flight: { include: { originAirport: true, destinationAirport: true } },
      decisions: true,
      assessments: { orderBy: { createdAt: "desc" }, take: 1, select: { shownRecommendation: true, usedFixture: true } },
      passengers: { select: { entitlements: { select: { kind: true, status: true, amountCents: true } }, displayEmail: true } },
    },
  });
  return ds.map((d) => {
    const ents = d.passengers.flatMap((p) => p.entitlements);
    const paid = ents.filter((e) => e.status === "PAID");
    return {
      id: d.id,
      scenarioKey: d.scenarioKey,
      flightNumber: d.flight.flightNumber,
      route: `${d.flight.originAirport.iata} to ${d.flight.destinationAirport.iata}`,
      schedDep: d.flight.schedDep.toISOString(),
      tz: d.flight.originAirport.tz,
      type: d.type,
      status: d.status,
      passengers: d.passengers.length,
      recommendation: d.assessments[0]?.shownRecommendation ?? null,
      cachedAi: d.assessments[0]?.usedFixture ?? false,
      decision: d.decisions[0]?.kind ?? null,
      paidCount: paid.length,
      paidCents: paid.reduce((s, e) => s + e.amountCents, 0),
      flags: [
        ...(ents.some((e) => e.status === "NEEDS_HUMAN_CHECK") ? ["Needs check"] : []),
        ...(d.passengers.some((p) => !p.displayEmail) ? ["Missing email"] : []),
      ],
    };
  });
}

export async function disruptionDetail(db: PrismaClient, id: string) {
  const d = await db.disruption.findUnique({
    where: { id },
    include: {
      flight: { include: { originAirport: true, destinationAirport: true, previousFlight: true, aircraft: true } },
      decisions: { include: { user: { select: { name: true } } } },
      assessments: { orderBy: { createdAt: "desc" }, take: 1 },
      evidence: { orderBy: { createdAt: "asc" } },
      facts: { orderBy: [{ airportIcao: "asc" }, { observedAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!d) return null;
  const passengers = await db.passenger.findMany({
    where: { disruptionId: id },
    orderBy: { manifestIndex: "asc" },
    include: {
      booking: { select: { pnr: true, paymentMethod: true } },
      entitlements: { include: { payoutItems: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, receiver: true } } } },
      offers: { select: { paymentChoice: true, consentAt: true }, take: 1 },
    },
  });
  const batches = await db.payoutBatch.findMany({
    where: { items: { some: { entitlement: { passenger: { disruptionId: id } } } } },
    orderBy: { createdAt: "asc" },
    include: { items: { include: { entitlement: { select: { kind: true, passenger: { select: { displayName: true } } } } } } },
  });
  const auditEvents = await db.auditEvent.findMany({
    where: { OR: [{ entityType: "Disruption", entityId: id }, { entityType: "PayoutBatch", entityId: { in: batches.map((b) => b.id) } }, { entityType: "PayoutItem", entityId: { in: batches.flatMap((b) => b.items.map((i) => i.id)) } }] },
    orderBy: { createdAt: "asc" },
  });
  const paypalIds = batches.flatMap((b) => [b.paypalBatchId, ...b.items.map((i) => i.paypalItemId)]).filter((x): x is string => !!x);
  const webhooks = paypalIds.length
    ? await db.webhookEvent.findMany({ where: { resourceId: { in: paypalIds } }, orderBy: { receivedAt: "asc" }, select: { id: true, eventType: true, verified: true, processedAt: true, error: true, receivedAt: true, resourceId: true } })
    : [];
  // Refunds (Art 8(1)(a), REG-8-1): due within 7 days of the passenger's choice.
  const refundPassengers = await db.passenger.findMany({
    where: { disruptionId: id, choice: "REFUND" },
    orderBy: { manifestIndex: "asc" },
    select: { id: true, displayName: true, booking: { select: { pnr: true, paymentMethod: true, paypalCaptureId: true, refunds: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, paypalRefundId: true, lastError: true } } } }, entitlements: { where: { kind: "REFUND" }, select: { amountCents: true, status: true } } },
  });
  const choiceEvents = await db.auditEvent.findMany({ where: { action: "TRAVEL_CHOICE", entityId: { in: refundPassengers.map((p) => p.id) } }, orderBy: { createdAt: "desc" }, select: { entityId: true, createdAt: true } });
  const assessment = d.assessments[0] ?? null;
  const out = (assessment?.output ?? null) as { assessment: A1Output | null; notice: string | null } | null;
  const rules = loadRulePack();

  const ent = (p: (typeof passengers)[number], kind: string) => p.entitlements.find((e) => e.kind === kind);
  return {
    id: d.id,
    scenarioKey: d.scenarioKey,
    status: d.status,
    careReleasedAt: d.careReleasedAt?.toISOString() ?? null,
    type: d.type,
    informedAt: d.informedAt?.toISOString() ?? null,
    opsNote: d.opsNote,
    maintenanceLog: d.maintenanceLog,
    flight: {
      number: d.flight.flightNumber,
      origin: { icao: d.flight.origin, iata: d.flight.originAirport.iata, city: d.flight.originAirport.city, tz: d.flight.originAirport.tz },
      destination: { icao: d.flight.destination, iata: d.flight.destinationAirport.iata, city: d.flight.destinationAirport.city, tz: d.flight.destinationAirport.tz },
      schedDep: d.flight.schedDep.toISOString(),
      schedArr: d.flight.schedArr.toISOString(),
      aircraft: d.flight.aircraft?.registration ?? null,
      previous: d.flight.previousFlight ? { number: d.flight.previousFlight.flightNumber, origin: d.flight.previousFlight.origin, destination: d.flight.previousFlight.destination } : null,
    },
    decision: d.decisions[0] ? { kind: d.decisions[0].kind, by: d.decisions[0].user.name, typedName: d.decisions[0].typedName, reason: d.decisions[0].reason, citations: d.decisions[0].citations, differsFromAi: d.decisions[0].differsFromAi, at: d.decisions[0].createdAt.toISOString() } : null,
    assessment: assessment
      ? { output: out?.assessment ?? null, notice: out?.notice ?? null, shown: assessment.shownRecommendation, model: assessment.model, modelRecommendation: assessment.modelRecommendation, promptVersion: assessment.promptVersion, usedFixture: assessment.usedFixture, retries: assessment.retries, costUsd: assessment.costUsd, at: assessment.createdAt.toISOString() }
      : null,
    evidence: d.evidence.map((e) => ({ id: e.id, kind: e.kind, airportIcao: e.airportIcao, raw: e.raw, sourceUrl: e.sourceUrl, retrievedAt: e.retrievedAt?.toISOString() ?? null })),
    facts: d.facts.map((f) => ({ id: f.id, airport: f.airportIcao, observedAt: f.observedAt.toISOString(), kind: f.kind, text: f.text })),
    passengers: passengers.map((p) => {
      const comp = ent(p, "COMPENSATION");
      const care = p.entitlements.filter((e) => e.kind !== "COMPENSATION" && e.kind !== "REFUND");
      const latestItem = [comp, ent(p, "MEAL_ALLOWANCE")].flatMap((e) => e?.payoutItems ?? [])[0];
      return {
        id: p.id,
        index: p.manifestIndex,
        name: p.displayName,
        email: p.displayEmail,
        pnr: p.booking.pnr,
        priority: p.priorityReason,
        fareType: p.fareType,
        finalDestination: p.finalDestination,
        receiver: p.payoutReceiver,
        receiverKind: p.receiverKind,
        choice: p.choice,
        paymentChoice: p.offers[0]?.paymentChoice ?? null,
        compensationCents: comp?.amountCents ?? 0,
        compensationStatus: comp?.status ?? "OUT_OF_SCOPE",
        careCents: care.reduce((s, e) => s + e.amountCents, 0),
        payoutStatus: latestItem?.status ?? null,
        entitlements: p.entitlements.map((e) => ({ id: e.id, kind: e.kind, amountCents: e.amountCents, status: e.status, needsHumanCheckReason: e.needsHumanCheckReason, trace: e.trace as { ruleId: string; inputs: Record<string, unknown>; outcome: string }[] })),
      };
    }),
    batches: batches.map((b) => ({ id: b.id, senderBatchId: b.senderBatchId, paypalBatchId: b.paypalBatchId, kind: b.kind, status: b.status, itemCount: b.itemCount, totalCents: b.totalCents, lastError: b.lastError, lastSyncedAt: b.lastSyncedAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(), items: b.items.map((i) => ({ id: i.id, name: i.entitlement.passenger.displayName, kind: i.entitlement.kind, receiver: i.receiver, amountCents: i.amountCents, status: i.status, paypalItemId: i.paypalItemId, lastError: i.lastError })) })),
    refunds: refundPassengers.map((p) => {
      const chosenAt = choiceEvents.find((e) => e.entityId === p.id)?.createdAt ?? null;
      const r = p.booking.refunds[0];
      return {
        passengerId: p.id,
        name: p.displayName,
        pnr: p.booking.pnr,
        amountCents: p.entitlements[0]?.amountCents ?? 0,
        entitlementStatus: p.entitlements[0]?.status ?? null,
        viaPaypal: p.booking.paymentMethod === "PAYPAL" && p.booking.paypalCaptureId !== null,
        refundStatus: r?.status ?? null,
        paypalRefundId: r?.paypalRefundId ?? null,
        lastError: r?.lastError ?? null,
        chosenAt: chosenAt?.toISOString() ?? null,
        dueBy: chosenAt ? new Date(chosenAt.getTime() + 7 * 86_400_000).toISOString() : null,
        daysLeft: chosenAt ? Math.ceil((chosenAt.getTime() + 7 * 86_400_000 - Date.now()) / 86_400_000) : null,
      };
    }),
    webhooks: webhooks.map((w) => ({ ...w, receivedAt: w.receivedAt.toISOString(), processedAt: w.processedAt?.toISOString() ?? null })),
    audit: auditEvents.map((a) => ({ id: a.id, at: a.createdAt.toISOString(), actorType: a.actorType, action: a.action, summary: a.summary })),
    rules: Object.fromEntries(rules.map((r) => [r.id, { title: r.title, kind: r.kind, summary: r.summary, url: r.url, excerpt: r.excerpt }])),
    citable: rules.filter((r) => r.status === "VERIFIED" && (r.kind === "LAW" || r.kind === "CASE_LAW")).map((r) => ({ id: r.id, title: r.title })),
  };
}

export type DisruptionDetail = NonNullable<Awaited<ReturnType<typeof disruptionDetail>>>;
