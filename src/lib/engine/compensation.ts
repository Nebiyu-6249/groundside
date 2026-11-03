// Compensation (Art 5(1)(c), 5(3), 7; Sturgeon, Nelson, Folkerts, Germanwings).
// The engine never decides extraordinary circumstances: it reads the human decision.

import { BAND_AMOUNT_CENTS, BAND_THRESHOLD_MINUTES } from "./distance";
import { iso, minutesBetween } from "./time";
import { entitlement, step } from "./trace";
import type { Band, DisruptionInput, EngineContext, EntitlementResult, PassengerInput, TraceStep } from "./types";

const DAY = 24 * 60;

interface Owed {
  owed: boolean;
  /** Arrival delay at the final destination in minutes, when known. */
  arrivalDelayMinutes: number | null;
  humanCheckReason: string | null;
}

function cancellationOwed(d: DisruptionInput, p: PassengerInput, trace: TraceStep[]): Owed {
  trace.push(step("REG-2-L", { type: d.type }, "The flight was not operated: a cancellation"));
  const r = p.rerouting;
  const arrivalDelayMinutes = r ? minutesBetween(p.schedArrFinal, r.arrFinal) : null;
  if (!d.informedAt) {
    trace.push(step("REG-5-4", { informedAt: null }, "No record of when passengers were informed; the carrier carries the burden of proof, so no notice exception applies"));
    trace.push(step("REG-5-1-C", { informedAt: null }, "Compensation owed"));
    return { owed: true, arrivalDelayMinutes, humanCheckReason: null };
  }

  const noticeMinutes = minutesBetween(d.informedAt, d.flight.schedDep);
  const base = { informedAt: iso(d.informedAt), schedDep: iso(d.flight.schedDep), noticeMinutes, noticeDays: Math.floor(noticeMinutes / DAY) };
  trace.push(step("REG-5-4", { informedAt: iso(d.informedAt) }, `Passengers informed at ${iso(d.informedAt)} (carrier record)`));

  if (noticeMinutes >= 14 * DAY) {
    trace.push(step("REG-5-1-C", base, "Informed at least two weeks before departure: exception (i), no compensation"));
    return { owed: false, arrivalDelayMinutes, humanCheckReason: null };
  }

  // Exceptions (ii) and (iii) need re-routing that departs not too early and arrives soon enough.
  const [earlyLimit, lateLimit, label] = noticeMinutes >= 7 * DAY ? [120, 240, "(ii)"] : [60, 120, "(iii)"];
  const window = label === "(ii)" ? "between two weeks and seven days" : "less than seven days";
  if (!r?.offered) {
    trace.push(step("REG-5-1-C", { ...base, reroutingOffered: false }, `Informed ${window} before departure and no re-routing offered: exception ${label} does not apply, compensation owed`));
    return { owed: true, arrivalDelayMinutes, humanCheckReason: null };
  }
  const departsEarlyBy = minutesBetween(r.dep, d.flight.schedDep);
  const inputs = { ...base, reroutingDep: iso(r.dep), reroutingArrFinal: iso(r.arrFinal), departsEarlyByMinutes: departsEarlyBy, arrivesLateByMinutes: arrivalDelayMinutes, earlyLimitMinutes: earlyLimit, lateLimitMinutes: lateLimit };
  const exceptionApplies = departsEarlyBy <= earlyLimit && (arrivalDelayMinutes ?? Infinity) < lateLimit;
  trace.push(
    step(
      "REG-5-1-C",
      inputs,
      exceptionApplies
        ? `Informed ${window} before departure and re-routed within ${earlyLimit / 60} h early / under ${lateLimit / 60} h late: exception ${label}, no compensation`
        : `Informed ${window} before departure; re-routing arrives ${arrivalDelayMinutes} min late (limit under ${lateLimit}) or departs too early: exception ${label} does not apply, compensation owed`,
    ),
  );
  return { owed: !exceptionApplies, arrivalDelayMinutes, humanCheckReason: null };
}

function delayOwed(d: DisruptionInput, p: PassengerInput, trace: TraceStep[]): Owed {
  if (!p.arrFinalDoorOpen) {
    trace.push(step("CJEU-C-452-13", { arrFinalDoorOpen: null }, "Arrival time at the final destination (first door open) not known yet"));
    return { owed: false, arrivalDelayMinutes: null, humanCheckReason: "Arrival time at the final destination is not known yet" };
  }
  const arrivalDelayMinutes = minutesBetween(p.schedArrFinal, p.arrFinalDoorOpen);
  trace.push(step("CJEU-C-452-13", { arrFinalDoorOpen: iso(p.arrFinalDoorOpen) }, "Arrival time is when the first door opened"));
  if (p.finalDestination.icao !== d.flight.destination.icao) {
    trace.push(step("CJEU-C-11-11", { flightDestination: d.flight.destination.icao, finalDestination: p.finalDestination.icao }, "Connecting booking: the delay is measured at the final destination"));
  }
  const owed = arrivalDelayMinutes >= 180;
  trace.push(
    step(
      "CJEU-C-402-07",
      { schedArrFinal: iso(p.schedArrFinal), arrFinalDoorOpen: iso(p.arrFinalDoorOpen), arrivalDelayMinutes, thresholdMinutes: 180 },
      owed ? `Arrived ${arrivalDelayMinutes} min late at the final destination: 3 hours or more, compensation owed` : `Arrived ${arrivalDelayMinutes} min late: under 3 hours, no compensation`,
    ),
  );
  if (owed) trace.push(step("CJEU-C-581-10", { arrivalDelayMinutes }, "Confirmed by the Grand Chamber in Nelson"));
  return { owed, arrivalDelayMinutes, humanCheckReason: null };
}

/** Article 7(2) for re-routed cancellations, or Sturgeon paragraph 63 for long-haul delays. */
function reduction(d: DisruptionInput, p: PassengerInput, band: Band, owed: Owed, ctx: EngineContext, trace: TraceStep[]): boolean {
  const delay = owed.arrivalDelayMinutes;
  if (delay === null) return false;
  if (d.type === "CANCELLATION") {
    const accepted = p.rerouting?.accepted === true && p.choice !== "REFUND";
    const limit = BAND_THRESHOLD_MINUTES[band];
    if (!accepted || delay > limit) {
      if (accepted) trace.push(step("REG-7-2", { band, arrivalDelayMinutes: delay, limitMinutes: limit }, `Re-routed arrival ${delay} min late, more than ${limit} min: no reduction`));
      return false;
    }
    trace.push(step("REG-7-2", { band, arrivalDelayMinutes: delay, limitMinutes: limit }, `Re-routed arrival ${delay} min late, within ${limit} min: the carrier may reduce by 50%`));
  } else {
    if (band !== "B3" || delay < 180 || delay >= 240) return false;
    trace.push(step("CJEU-C-402-07-P63", { band, arrivalDelayMinutes: delay }, "Long-haul delay of at least 3 but under 4 hours: the carrier may reduce by 50% (Art 7(2)(c) by analogy)"));
  }
  trace.push(step("POL-ART7-2", { applyArt7_2Reduction: ctx.policy.applyArt7_2Reduction }, ctx.policy.applyArt7_2Reduction ? "Demo Air policy applies the reduction" : "Demo Air policy does not apply the reduction"));
  return ctx.policy.applyArt7_2Reduction;
}

export function computeCompensation(
  d: DisruptionInput,
  p: PassengerInput,
  band: Band,
  shared: TraceStep[],
  ctx: EngineContext,
  scopeHumanCheckReason: string | null,
): EntitlementResult {
  const trace = [...shared];
  const owed = d.type === "CANCELLATION" ? cancellationOwed(d, p, trace) : delayOwed(d, p, trace);
  const humanCheck = owed.humanCheckReason ?? scopeHumanCheckReason;
  if (!owed.owed) {
    return entitlement("COMPENSATION", 0, owed.humanCheckReason ? "NEEDS_HUMAN_CHECK" : "NOT_OWED", trace, ctx.rules, humanCheck);
  }

  let amount = BAND_AMOUNT_CENTS[band];
  if (reduction(d, p, band, owed, ctx, trace)) {
    amount = amount / 2;
    trace.push(step("REG-7-1", { baseCents: BAND_AMOUNT_CENTS[band], amountCents: amount }, `Compensation reduced by 50% to ${amount / 100} EUR`));
  }

  // Article 5(3): only a signed human decision can remove compensation.
  if (d.decision === "DENIAL_SIGNED") {
    trace.push(step("REG-5-3", { decision: d.decision, decisionId: d.decisionId ?? null }, "Duty manager signed a denial citing extraordinary circumstances: no compensation"));
    return entitlement("COMPENSATION", 0, "NOT_OWED", trace, ctx.rules, humanCheck);
  }
  if (d.decision === "PENDING") {
    trace.push(step("REG-5-3", { decision: d.decision }, "Awaiting the duty manager's decision on extraordinary circumstances; nothing is paid yet"));
    return entitlement("COMPENSATION", amount, "PENDING_DECISION", trace, ctx.rules, humanCheck);
  }
  trace.push(step("REG-5-3", { decision: d.decision, decisionId: d.decisionId ?? null }, "Duty manager approved compensation: extraordinary circumstances are not relied on"));
  return entitlement("COMPENSATION", amount, "READY", trace, ctx.rules, humanCheck);
}
