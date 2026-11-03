// Rule pack entry format (docs/SPEC.md 6.1). Stored as one JSON file per rule in /rules.

import { z } from "zod";

export const RULE_KINDS = ["LAW", "CASE_LAW", "GUIDANCE", "POLICY"] as const;
export const RULE_STATUSES = ["VERIFIED", "UNVERIFIED"] as const;

/** Separates verbatim fragments inside one excerpt; each fragment must match the source. */
export const FRAGMENT_SEPARATOR = " [...] ";

export const ruleSchema = z.strictObject({
  id: z.string().regex(/^[A-Z0-9-]+$/),
  title: z.string().min(1),
  source: z.string().min(1),
  url: z.string().min(1),
  /** CELEX number of the official text, or null for Demo Air policy. */
  celex: z.string().nullable(),
  excerpt: z.string().min(1),
  summary: z.string().min(1),
  kind: z.enum(RULE_KINDS),
  status: z.enum(RULE_STATUSES),
  verifiedAgainst: z.string(),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string(),
});

export type Rule = z.infer<typeof ruleSchema>;
export type RuleKind = Rule["kind"];
export type RuleStatus = Rule["status"];

/** What the engine needs to know about the pack: which IDs exist and their status. */
export type RuleStatusMap = ReadonlyMap<string, RuleStatus>;
