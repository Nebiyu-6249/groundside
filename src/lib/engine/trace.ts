// Trace steps and the rule-status check every step goes through (docs/SPEC.md 5).

import type { RuleStatusMap } from "../rules/schema";
import { ENGINE_VERSION, type EntitlementKind, type EntitlementResult, type EntitlementStatus, type TraceStep, type TraceValue } from "./types";

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export function step(ruleId: string, inputs: Record<string, TraceValue>, outcome: string): TraceStep {
  return { ruleId, inputs, outcome };
}

/** IDs in the trace that are UNVERIFIED. Throws if a step cites an ID the pack does not have. */
export function unverifiedRules(trace: readonly TraceStep[], rules: RuleStatusMap): string[] {
  const unverified = new Set<string>();
  for (const s of trace) {
    const status = rules.get(s.ruleId);
    if (status === undefined) throw new EngineError(`Trace cites unknown rule ${s.ruleId}`);
    if (status === "UNVERIFIED") unverified.add(s.ruleId);
  }
  return [...unverified];
}

/**
 * Builds an entitlement. If any cited rule is UNVERIFIED, or a reason is given, the amount is
 * still computed but the status becomes NEEDS_HUMAN_CHECK.
 */
export function entitlement(
  kind: EntitlementKind,
  amountCents: number,
  status: EntitlementStatus,
  trace: TraceStep[],
  rules: RuleStatusMap,
  humanCheckReason: string | null = null,
): EntitlementResult {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new EngineError(`Bad amount ${amountCents} for ${kind}`);
  const unverified = unverifiedRules(trace, rules);
  const reasons = [
    ...(humanCheckReason ? [humanCheckReason] : []),
    ...unverified.map((id) => `Rule ${id} is not verified against the official text`),
  ];
  const needsHumanCheck = reasons.length > 0;
  return {
    kind,
    amountCents,
    currency: "EUR",
    status: needsHumanCheck && status !== "NOT_OWED" ? "NEEDS_HUMAN_CHECK" : status,
    needsHumanCheck,
    needsHumanCheckReason: needsHumanCheck ? reasons.join("; ") : null,
    engineVersion: ENGINE_VERSION,
    trace,
  };
}
