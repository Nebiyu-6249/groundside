// Loads the rule pack from /rules and answers the two questions code asks of it:
// which IDs exist (engine traces) and which IDs the AI may cite (golden rule 3).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ruleSchema, type Rule, type RuleStatusMap } from "./schema";

export const RULES_DIR = path.join(process.cwd(), "rules");

export class RulePackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulePackError";
  }
}

/** Reads and validates every rule file. Throws on a malformed file, a duplicate or a misnamed file. */
export function loadRulePack(): Rule[] {
  const rules: Rule[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(path.join(process.cwd(), "rules")).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = ruleSchema.safeParse(JSON.parse(readFileSync(path.join(process.cwd(), "rules", file), "utf8")));
    if (!parsed.success) throw new RulePackError(`${file}: ${parsed.error.message}`);
    const rule = parsed.data;
    if (`${rule.id}.json` !== file) throw new RulePackError(`${file}: id ${rule.id} does not match the file name`);
    if (seen.has(rule.id)) throw new RulePackError(`duplicate rule id ${rule.id}`);
    seen.add(rule.id);
    rules.push(rule);
  }
  return rules;
}

export function statusMap(rules: readonly Rule[]): RuleStatusMap {
  return new Map(rules.map((r) => [r.id, r.status]));
}

/**
 * IDs the AI may cite: VERIFIED law and case law, plus VERIFIED Demo Air policy when the
 * context is policy. Guidance and unverified entries are never citable.
 */
export function citableIds(rules: readonly Rule[], opts: { includePolicy: boolean }): Set<string> {
  return new Set(
    rules
      .filter((r) => r.status === "VERIFIED")
      .filter((r) => r.kind === "LAW" || r.kind === "CASE_LAW" || (opts.includePolicy && r.kind === "POLICY"))
      .map((r) => r.id),
  );
}
