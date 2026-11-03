// Care (Art 5(1)(b), 6(1), 9; McDonagh). Amounts are Demo Air policy, labelled as policy.
// Care never depends on the extraordinary-circumstances decision.

import { BAND_THRESHOLD_MINUTES, journeyDistance } from "./distance";
import { daysBetweenLocalDates, iso, localDate, minutesBetween } from "./time";
import { entitlement, step } from "./trace";
import type { DisruptionInput, EngineContext, EntitlementResult, PassengerInput, TraceStep } from "./types";

const eur = (cents: number) => `${cents / 100} EUR`;

/** Meal allowance for a wait of `waitMinutes`, starting once the care trigger is reached at `triggerMinutes`. */
export function mealAllowanceCents(waitMinutes: number, triggerMinutes: number, policy: EngineContext["policy"]): number {
  const every = policy.mealAllowanceFurtherEveryHours * 60;
  const further = Math.floor(Math.max(0, waitMinutes - triggerMinutes) / every);
  const total = policy.mealAllowanceFirstEur + further * policy.mealAllowanceEachFurtherHoursEur;
  const cap = policy.mealAllowanceMaxPer24hEur * Math.max(1, Math.ceil(waitMinutes / (24 * 60)));
  return Math.min(total, cap) * 100;
}

interface CareWindow {
  triggered: boolean;
  /** Minutes from the scheduled departure to the new departure, when known. */
  waitMinutes: number | null;
  triggerMinutes: number;
  newDep: Date | null;
  /** Rule that triggers care and hotel for this disruption type. */
  ruleId: "REG-5-1-B" | "REG-6-1";
}

function careWindow(d: DisruptionInput, p: PassengerInput, trace: TraceStep[]): CareWindow {
  if (d.type === "CANCELLATION") {
    const newDep = p.rerouting?.offered ? p.rerouting.dep : null;
    const waitMinutes = newDep ? minutesBetween(d.flight.schedDep, newDep) : null;
    trace.push(step("REG-5-1-B", { type: d.type, newDep: newDep ? iso(newDep) : null, waitMinutes }, "Cancellation: meals, refreshments and two calls or e-mails are always offered"));
    return { triggered: true, waitMinutes, triggerMinutes: 0, newDep, ruleId: "REG-5-1-B" };
  }
  // Article 6(1) thresholds depend on the delayed flight's own distance.
  const flight = journeyDistance(d.flight.origin, d.flight.destination);
  const threshold = BAND_THRESHOLD_MINUTES[flight.band];
  const newDep = d.flight.expectedDep ?? null;
  const waitMinutes = newDep ? minutesBetween(d.flight.schedDep, newDep) : null;
  const triggered = waitMinutes !== null && waitMinutes >= threshold;
  trace.push(
    step(
      "REG-6-1",
      { flightDistanceKm: flight.distanceKm, flightBand: flight.band, thresholdMinutes: threshold, expectedDep: newDep ? iso(newDep) : null, departureDelayMinutes: waitMinutes },
      triggered
        ? `Departure delay ${waitMinutes} min reaches the ${threshold} min threshold for a ${flight.distanceKm} km flight: care is offered`
        : `Departure delay ${waitMinutes ?? "unknown"} min is under the ${threshold} min threshold: no care yet`,
    ),
  );
  return { triggered, waitMinutes, triggerMinutes: threshold, newDep, ruleId: "REG-6-1" };
}

export function computeCare(d: DisruptionInput, p: PassengerInput, shared: TraceStep[], ctx: EngineContext): EntitlementResult[] {
  const { policy, rules } = ctx;
  const base = [...shared];
  const w = careWindow(d, p, base);
  if (d.decision === "DENIAL_SIGNED") {
    base.push(step("CJEU-C-12-11", { decision: d.decision }, "Care is owed even when compensation is denied for extraordinary circumstances"));
  }
  if (p.priorityReason) {
    base.push(step("REG-9-3", { priorityReason: p.priorityReason }, "Particular attention to this passenger's needs"));
    base.push(step("REG-11", { priorityReason: p.priorityReason }, "Care as soon as possible: priority in payout batches"));
  }

  if (!w.triggered) {
    return (["MEAL_ALLOWANCE", "HOTEL_REIMBURSEMENT_CAP", "TRANSPORT_REIMBURSEMENT_CAP"] as const).map((kind) =>
      entitlement(kind, 0, "NOT_OWED", [...base], rules),
    );
  }

  // Care ends once the passenger takes a refund instead of waiting for re-routing.
  const refundChosen = p.choice === "REFUND";
  const careEndStep = step("COM-GL-2024-4-3-1", { choice: p.choice }, "Passenger chose a refund: care lasts only while waiting for re-routing, so it ends here");

  // Meals and refreshments (Art 9(1)(a)), amounts from Demo Air policy.
  const mealTrace = [...base];
  let mealCents: number;
  let mealReason: string | null = null;
  if (refundChosen) {
    mealTrace.push(careEndStep);
    mealCents = policy.mealAllowanceFirstEur * 100;
    mealTrace.push(step("POL-MEALS", { firstEur: policy.mealAllowanceFirstEur }, `First allowance only: ${eur(mealCents)}`));
  } else if (w.waitMinutes === null) {
    mealCents = policy.mealAllowanceFirstEur * 100;
    mealReason = "New departure time not known: only the first meal allowance is computed";
    mealTrace.push(step("POL-MEALS", { firstEur: policy.mealAllowanceFirstEur }, `New departure unknown: first allowance ${eur(mealCents)}`));
  } else {
    mealCents = mealAllowanceCents(w.waitMinutes, w.triggerMinutes, policy);
    mealTrace.push(
      step(
        "POL-MEALS",
        { waitMinutes: w.waitMinutes, triggerMinutes: w.triggerMinutes, firstEur: policy.mealAllowanceFirstEur, eachFurtherEur: policy.mealAllowanceEachFurtherHoursEur, everyHours: policy.mealAllowanceFurtherEveryHours, maxPer24hEur: policy.mealAllowanceMaxPer24hEur, amountCents: mealCents },
        `Wait of ${w.waitMinutes} min: meal allowance ${eur(mealCents)} (Demo Air policy)`,
      ),
    );
  }
  mealTrace.splice(base.length, 0, step("REG-9-1", { item: "meals" }, "Meals and refreshments in reasonable relation to the waiting time"));
  const meals = entitlement("MEAL_ALLOWANCE", mealCents, "READY", mealTrace, rules, mealReason);

  // Hotel and transport (Art 9(1)(b)(c)) when the new departure is at least the next day.
  const hotelTrace = [...base];
  const transportTrace = [...base];
  if (refundChosen) {
    hotelTrace.push(careEndStep);
    transportTrace.push(careEndStep);
    return [meals, entitlement("HOTEL_REIMBURSEMENT_CAP", 0, "NOT_OWED", hotelTrace, rules), entitlement("TRANSPORT_REIMBURSEMENT_CAP", 0, "NOT_OWED", transportTrace, rules)];
  }
  const tz = d.flight.origin.tz;
  const plannedDate = localDate(d.flight.schedDep, tz);
  const newDate = w.newDep ? localDate(w.newDep, tz) : null;
  const nightsByDate = newDate ? Math.max(0, daysBetweenLocalDates(plannedDate, newDate)) : 0;
  const nights = nightsByDate > 0 ? nightsByDate : p.overnightStayNecessary ? 1 : 0;
  const hotelInputs = { plannedDepLocalDate: plannedDate, newDepLocalDate: newDate, timeZone: tz, overnightStayNecessary: p.overnightStayNecessary ?? false, nights };
  if (nights === 0) {
    const outcome = newDate ? "New departure is the same day: no hotel" : "New departure not known: no hotel computed";
    hotelTrace.push(step(w.ruleId, hotelInputs, outcome));
    transportTrace.push(step(w.ruleId, hotelInputs, outcome));
    const reason = newDate ? null : "New departure time not known";
    return [meals, entitlement("HOTEL_REIMBURSEMENT_CAP", 0, "NOT_OWED", hotelTrace, rules, reason), entitlement("TRANSPORT_REIMBURSEMENT_CAP", 0, "NOT_OWED", transportTrace, rules, reason)];
  }
  const why = nightsByDate > 0 ? `New departure is ${nights} day(s) after the planned departure (local date at ${d.flight.origin.iata})` : "An overnight stay became necessary (duty manager flag)";
  const hotelCents = nights * policy.hotelCapPerNightEur * 100;
  hotelTrace.push(step(w.ruleId, hotelInputs, `${why}: hotel and transport are offered`));
  hotelTrace.push(step("REG-9-1", { item: "hotel", nights }, "Hotel accommodation where a stay of one or more nights becomes necessary"));
  hotelTrace.push(step("POL-HOTEL", { nights, capPerNightEur: policy.hotelCapPerNightEur, amountCents: hotelCents }, `${nights} night(s) at up to ${policy.hotelCapPerNightEur} EUR: cap ${eur(hotelCents)} (Demo Air policy)`));

  const transportCents = 2 * policy.groundTransportCapEachWayEur * 100;
  transportTrace.push(step(w.ruleId, hotelInputs, `${why}: hotel and transport are offered`));
  transportTrace.push(step("REG-9-1", { item: "transport" }, "Transport between the airport and the place of accommodation"));
  transportTrace.push(step("POL-TRANSPORT", { ways: 2, capEachWayEur: policy.groundTransportCapEachWayEur, amountCents: transportCents }, `Two ways at up to ${policy.groundTransportCapEachWayEur} EUR: cap ${eur(transportCents)} (Demo Air policy)`));

  return [
    meals,
    entitlement("HOTEL_REIMBURSEMENT_CAP", hotelCents, "READY", hotelTrace, rules),
    entitlement("TRANSPORT_REIMBURSEMENT_CAP", transportCents, "READY", transportTrace, rules),
  ];
}
