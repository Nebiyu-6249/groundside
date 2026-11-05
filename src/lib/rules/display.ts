// Rule titles for the screen. CJEU case names often name a real airline ("McDonagh v Ryanair"),
// and the UI shows no third-party trademarks (golden rule 10), so case law is shown by its case
// number and date; the rule pack keeps the full official title for the record.

export function displayTitle(rule: { kind: string; title: string }): string {
  if (rule.kind !== "CASE_LAW") return rule.title;
  const cases = /\(((?:Joined )?Cases? [^)]+)\)/.exec(rule.title)?.[1];
  const date = /\),\s*(.+)$/.exec(rule.title)?.[1];
  return cases ? `${cases.replace(/ and others$/i, "")}${date ? `, ${date}` : ""}` : rule.title;
}
