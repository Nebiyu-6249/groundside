// Scope (Art 3): which passengers the Regulation covers.

import { step } from "./trace";
import type { DisruptionInput, PassengerInput, TraceStep } from "./types";

export interface ScopeResult {
  inScope: boolean;
  outOfScope: { reason: string; ruleId: string } | null;
  /** Set when a scope condition cannot be decided by code. */
  humanCheckReason: string | null;
  trace: TraceStep[];
}

export function evaluateScope(d: DisruptionInput, p: PassengerInput): ScopeResult {
  const trace: TraceStep[] = [];
  const out = (reason: string, ruleId: string): ScopeResult => {
    trace.push(step(ruleId, {}, `Out of scope: ${reason}`));
    return { inScope: false, outOfScope: { reason, ruleId }, humanCheckReason: null, trace };
  };
  let humanCheckReason: string | null = null;

  // Art 3(1): departure from the EU/EEA/CH, or from a third country to it on a Community carrier.
  const departure = p.firstDeparture;
  if (departure.scope === "EU261") {
    trace.push(step("REG-3-1", { firstDeparture: departure.icao, country: departure.country }, `Departs from ${departure.iata}, an airport in scope (Art 3(1)(a))`));
  } else if (d.flight.destination.scope === "EU261" && d.carrier.isCommunityCarrier) {
    humanCheckReason = "Departure from a third country: check whether benefits or compensation and assistance were received there (Art 3(1)(b))";
    trace.push(step("REG-3-1", { firstDeparture: departure.icao, destination: d.flight.destination.icao, communityCarrier: true }, "Departs from a third country to an airport in scope on a Community carrier (Art 3(1)(b)); the third-country benefits exception needs a human check"));
  } else {
    const why = departure.scope === "UK261_UNSUPPORTED" ? "departs from the UK; UK261 is not supported" : `departs from ${departure.iata}, outside the EU, EEA and Switzerland`;
    return out(why, "REG-3-1");
  }

  // Art 3(2)(a): confirmed reservation; check-in on time, except for cancellations.
  if (!p.confirmedReservation) return out("no confirmed reservation", "REG-3-2");
  if (d.type === "CANCELLATION") {
    trace.push(step("REG-3-2", { confirmedReservation: true, type: d.type }, "Confirmed reservation; the check-in condition does not apply to cancellations"));
  } else if (!p.checkedInOnTime) {
    return out("did not present for check-in on time", "REG-3-2");
  } else {
    trace.push(step("REG-3-2", { confirmedReservation: true, checkedInOnTime: true }, "Confirmed reservation and checked in on time"));
  }

  // Art 3(3): free and non-public reduced fares excluded; frequent flyer tickets included.
  if (p.fareType === "FREE_OF_CHARGE") return out("travelling free of charge", "REG-3-3");
  if (p.fareType === "STAFF_REDUCED_NOT_PUBLIC") return out("reduced fare not available to the public (staff travel)", "REG-3-3");
  trace.push(
    step(
      "REG-3-3",
      { fareType: p.fareType },
      p.fareType === "FREQUENT_FLYER_AWARD" ? "Frequent flyer award ticket: covered" : "Public fare: covered",
    ),
  );
  return { inScope: true, outOfScope: null, humanCheckReason, trace };
}
