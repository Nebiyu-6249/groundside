// Refund right (Art 5(1)(a), 6(1)(iii), 8(1)(a)).

import { iso, minutesBetween } from "./time";
import { entitlement, step } from "./trace";
import type { DisruptionInput, EngineContext, EntitlementResult, PassengerInput, TraceStep } from "./types";

export function computeRefund(d: DisruptionInput, p: PassengerInput, shared: TraceStep[], ctx: EngineContext): EntitlementResult {
  const trace = [...shared];
  if (d.type === "CANCELLATION") {
    trace.push(step("REG-5-1-A", { type: d.type }, "Cancellation: the passenger chooses between a refund and re-routing"));
  } else {
    const delay = d.flight.expectedDep ? minutesBetween(d.flight.schedDep, d.flight.expectedDep) : null;
    const owed = delay !== null && delay >= 300;
    trace.push(
      step(
        "REG-6-1",
        { schedDep: iso(d.flight.schedDep), expectedDep: d.flight.expectedDep ? iso(d.flight.expectedDep) : null, departureDelayMinutes: delay, thresholdMinutes: 300 },
        owed ? `Departure delay ${delay} min: at least five hours, refund right` : `Departure delay ${delay ?? "unknown"} min: under five hours, no refund right`,
      ),
    );
    if (!owed) return entitlement("REFUND", 0, "NOT_OWED", trace, ctx.rules);
  }

  // Amount: the whole ticket for one segment; otherwise unused segments, plus flown ones
  // only when a human confirms the journey no longer serves its purpose.
  const { segments, totalCents, journeyNoLongerServesPurpose } = p.booking;
  let amountCents = totalCents;
  let humanCheckReason: string | null = null;
  if (segments.length > 1) {
    const counted = segments.filter((s) => !s.flown || journeyNoLongerServesPurpose);
    if (counted.some((s) => s.priceCents === undefined)) {
      amountCents = 0;
      humanCheckReason = "Segment prices are missing for a multi-segment refund";
    } else {
      amountCents = counted.reduce((sum, s) => sum + (s.priceCents ?? 0), 0);
    }
  }
  trace.push(
    step(
      "REG-8-1",
      { totalCents, segments: segments.length, flownSegments: segments.filter((s) => s.flown).length, journeyNoLongerServesPurpose: journeyNoLongerServesPurpose ?? false, amountCents },
      segments.length > 1 ? `Refund of ${amountCents / 100} EUR for the segments counted` : `Refund of the full ticket price, ${amountCents / 100} EUR, within seven days`,
    ),
  );

  if (p.choice === "REROUTING") {
    trace.push(step("REG-8-1", { choice: p.choice }, "Passenger chose re-routing instead of a refund"));
    return entitlement("REFUND", 0, "NOT_OWED", trace, ctx.rules);
  }
  return entitlement("REFUND", amountCents, p.choice === "REFUND" ? "READY" : "OFFERED", trace, ctx.rules, humanCheckReason);
}
