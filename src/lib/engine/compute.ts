// Entry point: every entitlement for one passenger on one disruption (docs/SPEC.md 5).

import { computeCare } from "./care";
import { computeCompensation } from "./compensation";
import { journeyDistance } from "./distance";
import { computeRefund } from "./refund";
import { evaluateScope } from "./scope";
import { ENGINE_VERSION, type DisruptionInput, type EngineContext, type PassengerInput, type PassengerResult } from "./types";

export function computePassenger(d: DisruptionInput, p: PassengerInput, ctx: EngineContext): PassengerResult {
  const priority = p.priorityReason ?? null;
  const scope = evaluateScope(d, p);
  if (!scope.inScope) {
    return { engineVersion: ENGINE_VERSION, inScope: false, outOfScope: scope.outOfScope, distanceKm: null, band: null, priority, trace: scope.trace, entitlements: [] };
  }
  const distance = journeyDistance(p.firstDeparture, p.finalDestination);
  const shared = [...scope.trace, ...distance.trace];
  return {
    engineVersion: ENGINE_VERSION,
    inScope: true,
    outOfScope: null,
    distanceKm: distance.distanceKm,
    band: distance.band,
    priority,
    trace: shared,
    entitlements: [
      computeCompensation(d, p, distance.band, shared, ctx, scope.humanCheckReason),
      ...computeCare(d, p, scope.trace, ctx),
      computeRefund(d, p, scope.trace, ctx),
    ],
  };
}
