// Status chips: every status has a text label and an icon shape, never colour alone (SPEC 12).

import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, HelpCircle, Loader2, Send, XCircle } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "neutral" | "attention" | "paid" | "error";

const TONE: Record<Tone, string> = {
  neutral: "border-line text-foreground",
  attention: "border-amber text-amber",
  paid: "border-green text-green",
  error: "border-red text-red",
};

export function Chip({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

const icon = (C: typeof Clock) => <C aria-hidden className="h-3.5 w-3.5" />;

const ENTITLEMENT: Record<string, { label: string; tone: Tone; icon: ReactNode }> = {
  PENDING_DECISION: { label: "Awaiting decision", tone: "attention", icon: icon(Clock) },
  READY: { label: "Ready", tone: "neutral", icon: icon(CircleDashed) },
  OFFERED: { label: "Offered", tone: "neutral", icon: icon(Send) },
  ACCEPTED: { label: "Accepted", tone: "neutral", icon: icon(CheckCircle2) },
  PAYING: { label: "Paying", tone: "attention", icon: icon(Loader2) },
  PAID: { label: "Paid", tone: "paid", icon: icon(CheckCircle2) },
  NOT_OWED: { label: "Not owed", tone: "neutral", icon: icon(Ban) },
  NEEDS_HUMAN_CHECK: { label: "Needs check", tone: "attention", icon: icon(AlertTriangle) },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: icon(XCircle) },
};

export function EntitlementStatus({ status }: { status: string }) {
  const s = ENTITLEMENT[status] ?? { label: status, tone: "neutral" as Tone, icon: icon(HelpCircle) };
  return <Chip tone={s.tone} icon={s.icon}>{s.label}</Chip>;
}

const RECOMMENDATION: Record<string, { label: string; tone: Tone; icon: ReactNode }> = {
  PAY_COMPENSATION: { label: "Pay compensation", tone: "neutral", icon: icon(CheckCircle2) },
  NO_COMPENSATION_HUMAN_MUST_DECIDE: { label: "No compensation: human decides", tone: "attention", icon: icon(AlertTriangle) },
  UNCERTAIN_HUMAN_MUST_DECIDE: { label: "Uncertain: human decides", tone: "attention", icon: icon(HelpCircle) },
};

export function RecommendationChip({ value }: { value: string | null | undefined }) {
  if (!value) return <Chip icon={icon(CircleDashed)}>Not assessed</Chip>;
  const r = RECOMMENDATION[value] ?? { label: value, tone: "neutral" as Tone, icon: icon(HelpCircle) };
  return <Chip tone={r.tone} icon={r.icon}>{r.label}</Chip>;
}

const PAYOUT: Record<string, { label: string; tone: Tone; icon: ReactNode }> = {
  CREATING: { label: "Creating", tone: "neutral", icon: icon(Loader2) },
  PENDING: { label: "Pending", tone: "attention", icon: icon(Clock) },
  PROCESSING: { label: "Processing", tone: "attention", icon: icon(Loader2) },
  SUCCESS: { label: "Paid", tone: "paid", icon: icon(CheckCircle2) },
  UNCLAIMED: { label: "Unclaimed", tone: "attention", icon: icon(AlertTriangle) },
  ONHOLD: { label: "On hold", tone: "attention", icon: icon(Clock) },
  FAILED: { label: "Failed", tone: "error", icon: icon(XCircle) },
  RETURNED: { label: "Returned", tone: "error", icon: icon(XCircle) },
  BLOCKED: { label: "Blocked", tone: "error", icon: icon(Ban) },
  DENIED: { label: "Denied", tone: "error", icon: icon(XCircle) },
  CANCELED: { label: "Cancelled", tone: "neutral", icon: icon(Ban) },
  REFUNDED: { label: "Refunded", tone: "neutral", icon: icon(Ban) },
  REVERSED: { label: "Reversed", tone: "error", icon: icon(XCircle) },
};

export function PayoutStatus({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-muted">Not sent</span>;
  const s = PAYOUT[status] ?? { label: status, tone: "neutral" as Tone, icon: icon(HelpCircle) };
  return <Chip tone={s.tone} icon={s.icon}>{s.label}</Chip>;
}

export function DemoLabel() {
  return <Chip icon={icon(HelpCircle)}>Demo data</Chip>;
}

export const eur = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;
