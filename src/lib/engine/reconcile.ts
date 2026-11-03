// Idempotent re-run (docs/SPEC.md 5.8): new engine output is merged into stored entitlements.
// Unpaid rows are updated; rows with a payout in flight or paid are never changed, and a
// difference is reported as a conflict for a human instead.

import type { EntitlementKind, EntitlementResult } from "./types";

export interface StoredEntitlement {
  id: string;
  kind: EntitlementKind;
  status: string;
  amountCents: number;
  payoutInFlight: boolean;
}

export type ReconcileAction =
  | { action: "CREATE"; kind: EntitlementKind; next: EntitlementResult }
  | { action: "UPDATE"; id: string; kind: EntitlementKind; next: EntitlementResult }
  | { action: "KEEP"; id: string; kind: EntitlementKind }
  | { action: "CONFLICT"; id: string; kind: EntitlementKind; storedAmountCents: number; computedAmountCents: number; reason: string };

const LOCKED_STATUSES = new Set(["PAYING", "PAID"]);

export function isLocked(e: StoredEntitlement): boolean {
  return e.payoutInFlight || LOCKED_STATUSES.has(e.status);
}

export function reconcile(stored: readonly StoredEntitlement[], computed: readonly EntitlementResult[]): ReconcileAction[] {
  const byKind = new Map(stored.map((e) => [e.kind, e]));
  return computed.map((next): ReconcileAction => {
    const current = byKind.get(next.kind);
    if (!current) return { action: "CREATE", kind: next.kind, next };
    const unchanged = current.amountCents === next.amountCents && current.status === next.status;
    if (isLocked(current)) {
      return current.amountCents === next.amountCents
        ? { action: "KEEP", id: current.id, kind: current.kind }
        : {
            action: "CONFLICT",
            id: current.id,
            kind: current.kind,
            storedAmountCents: current.amountCents,
            computedAmountCents: next.amountCents,
            reason: `Entitlement is ${current.payoutInFlight ? "being paid" : current.status.toLowerCase()}; the engine now computes a different amount`,
          };
    }
    return unchanged ? { action: "KEEP", id: current.id, kind: current.kind } : { action: "UPDATE", id: current.id, kind: current.kind, next };
  });
}
