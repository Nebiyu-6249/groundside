// Engine inputs and outputs (docs/SPEC.md 5.1, 5.8). Pure data: no I/O, no AI.

import type { Airport } from "./airports";
import type { AirlinePolicy } from "./policy";
import type { RuleStatusMap } from "../rules/schema";

export const ENGINE_VERSION = "1.0.0";

export type DisruptionType = "CANCELLATION" | "DELAY";
export type ExtraordinaryDecision = "PENDING" | "COMPENSATION_APPROVED" | "DENIAL_SIGNED";
export type FareType = "PUBLIC" | "FREQUENT_FLYER_AWARD" | "STAFF_REDUCED_NOT_PUBLIC" | "FREE_OF_CHARGE";
export type PassengerChoice = "UNDECIDED" | "REROUTING" | "REFUND";
export type PriorityReason = "REDUCED_MOBILITY" | "UNACCOMPANIED_MINOR";
export type Band = "B1" | "B2" | "B3";

export interface DisruptionInput {
  type: DisruptionType;
  /** The disrupted flight. */
  flight: {
    origin: Airport;
    destination: Airport;
    schedDep: Date;
    schedArr: Date;
    /** Delays: the reasonably expected (or actual) departure time. */
    expectedDep?: Date;
  };
  /** Cancellations: when passengers were told. Unknown means the carrier cannot prove it (Art 5(4)). */
  informedAt?: Date;
  carrier: { isCommunityCarrier: boolean };
  decision: ExtraordinaryDecision;
  /** ID of the signed decision, cited in the trace when compensation is denied. */
  decisionId?: string;
}

export interface BookingSegment {
  origin: string;
  destination: string;
  /** Price share of this segment; needed only for multi-segment refunds. */
  priceCents?: number;
  /** True if the passenger has already flown this segment. */
  flown: boolean;
}

export interface ReroutingInput {
  offered: boolean;
  accepted: boolean;
  dep: Date;
  /** Arrival at the final destination (door open, or expected). */
  arrFinal: Date;
}

export interface PassengerInput {
  firstDeparture: Airport;
  finalDestination: Airport;
  fareType: FareType;
  confirmedReservation: boolean;
  checkedInOnTime: boolean;
  schedArrFinal: Date;
  /** Actual or expected arrival at the final destination: the time the first door opened. */
  arrFinalDoorOpen?: Date;
  rerouting?: ReroutingInput;
  choice: PassengerChoice;
  priorityReason?: PriorityReason | null;
  /** Human flag: an overnight stay became necessary although the new departure is the same day. */
  overnightStayNecessary?: boolean;
  booking: {
    totalCents: number;
    segments: BookingSegment[];
    /** Human tick (Art 8(1)(a)): the journey no longer serves its purpose, so flown segments are refunded too. */
    journeyNoLongerServesPurpose?: boolean;
  };
}

export interface EngineContext {
  rules: RuleStatusMap;
  policy: AirlinePolicy;
}

export type TraceValue = string | number | boolean | null | TraceValue[] | { [key: string]: TraceValue };

export interface TraceStep {
  ruleId: string;
  inputs: Record<string, TraceValue>;
  outcome: string;
}

export type EntitlementKind =
  | "COMPENSATION"
  | "MEAL_ALLOWANCE"
  | "HOTEL_REIMBURSEMENT_CAP"
  | "TRANSPORT_REIMBURSEMENT_CAP"
  | "REFUND";

export type EntitlementStatus =
  | "PENDING_DECISION"
  | "READY"
  | "OFFERED"
  | "NOT_OWED"
  | "NEEDS_HUMAN_CHECK";

export interface EntitlementResult {
  kind: EntitlementKind;
  amountCents: number;
  currency: "EUR";
  status: EntitlementStatus;
  needsHumanCheck: boolean;
  needsHumanCheckReason: string | null;
  engineVersion: string;
  trace: TraceStep[];
}

export interface PassengerResult {
  engineVersion: string;
  inScope: boolean;
  outOfScope: { reason: string; ruleId: string } | null;
  distanceKm: number | null;
  band: Band | null;
  priority: PriorityReason | null;
  /** Steps shared by every entitlement: scope and distance. */
  trace: TraceStep[];
  entitlements: EntitlementResult[];
}
