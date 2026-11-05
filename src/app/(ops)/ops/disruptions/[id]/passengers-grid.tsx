"use client";

import { AllCommunityModule, colorSchemeDark, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import { EntitlementStatus, PayoutStatus } from "@/components/status";
import { euros, KIND_LABEL } from "@/lib/format";
import type { DisruptionDetail } from "@/lib/ops/queries";

ModuleRegistry.registerModules([AllCommunityModule]);

type Row = DisruptionDetail["passengers"][number];
type Rules = DisruptionDetail["rules"];

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  fontFamily: "var(--font-plex-sans)",
  backgroundColor: "#18212f",
  headerBackgroundColor: "#0f1622",
  borderColor: "#243042",
  accentColor: "#f2a93b",
  fontSize: 13,
});

const PRIORITY: Record<string, string> = { REDUCED_MOBILITY: "Reduced mobility", UNACCOMPANIED_MINOR: "Unaccompanied minor" };
const FARE: Record<string, string> = { PUBLIC: "Public", FREQUENT_FLYER_AWARD: "Award", STAFF_REDUCED_NOT_PUBLIC: "Staff (excluded)", FREE_OF_CHARGE: "Free (excluded)" };

export function PassengersGrid({ rows, rules, openAsPassenger }: { rows: Row[]; rules: Rules; openAsPassenger: (passengerId: string) => Promise<void> }) {
  const [selected, setSelected] = useState<Row | null>(null);
  const columns = useMemo<ColDef<Row>[]>(
    () => [
      { field: "name", headerName: "Name", pinned: "left", minWidth: 170 },
      { field: "pnr", headerName: "PNR", width: 90, cellClass: "font-mono" },
      { field: "priority", headerName: "Priority", width: 150, valueFormatter: (p) => (p.value ? PRIORITY[p.value] : "") },
      { field: "fareType", headerName: "Fare", width: 130, valueFormatter: (p) => FARE[p.value] ?? p.value },
      { field: "finalDestination", headerName: "Final dest.", width: 110, cellClass: "font-mono" },
      { field: "compensationCents", headerName: "Compensation", width: 130, type: "rightAligned", valueFormatter: (p) => euros(p.value ?? 0), cellClass: "font-mono" },
      { field: "compensationStatus", headerName: "Comp. status", width: 150, cellRenderer: (p: { value: string }) => (p.value === "OUT_OF_SCOPE" ? <span>Out of scope</span> : <EntitlementStatus status={p.value} />), filter: true },
      { field: "careCents", headerName: "Care", width: 110, type: "rightAligned", valueFormatter: (p) => euros(p.value ?? 0), cellClass: "font-mono" },
      { field: "choice", headerName: "Choice", width: 110, valueFormatter: (p) => ({ UNDECIDED: "Undecided", REROUTING: "Re-routing", REFUND: "Refund" })[p.value as string] ?? p.value },
      { field: "paymentChoice", headerName: "Paid via", width: 120, valueFormatter: (p) => ({ PAYPAL: "PayPal", BANK_TRANSFER: "Bank transfer", NONE: "No answer" })[p.value as string] ?? "No offer" },
      { field: "payoutStatus", headerName: "Payout", width: 130, cellRenderer: (p: { value: string | null }) => <PayoutStatus status={p.value} />, enableCellChangeFlash: true },
      { field: "receiver", headerName: "Sandbox receiver (demo pool)", minWidth: 240, valueFormatter: (p) => p.value ?? "None: no email on file" },
    ],
    [],
  );
  const totals = useMemo(() => [{ name: `Total (${rows.length})`, compensationCents: rows.reduce((s, r) => s + r.compensationCents, 0), careCents: rows.reduce((s, r) => s + r.careCents, 0) } as Row], [rows]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div role="region" aria-label="Passengers" className="h-[560px] min-w-0 flex-1">
        <AgGridReact<Row>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          getRowId={(p) => p.data.id}
          pinnedBottomRowData={totals}
          defaultColDef={{ sortable: true, resizable: true, enableCellChangeFlash: true }}
          rowSelection={{ mode: "singleRow", enableClickSelection: true, checkboxes: false }}
          onRowClicked={(e) => e.data && !e.rowPinned && setSelected(e.data)}
          // Keyboard: Enter or Space on a focused cell opens the same trace drawer (SPEC 12).
          onCellKeyDown={(e) => {
            const key = (e.event as KeyboardEvent | null)?.key;
            if ((key === "Enter" || key === " ") && e.data && !e.rowPinned) setSelected(e.data);
          }}
        />
      </div>
      {selected ? (
        <aside aria-label={`Entitlements for ${selected.name}`} className="w-full shrink-0 overflow-y-auto rounded border border-line p-4 lg:h-[560px] lg:w-[420px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">{selected.name}</h3>
              <p className="text-xs text-muted">Demo data. {selected.email ?? "No email on file"}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="rounded border border-line px-2 py-0.5 text-xs">Close</button>
          </div>
          <form action={openAsPassenger.bind(null, selected.id)} className="mt-3">
            <button type="submit" className="rounded border border-line px-2 py-1 text-xs hover:border-amber">Open as passenger</button>
          </form>
          {selected.entitlements.length === 0 ? <p className="mt-4 text-sm">Out of scope: no entitlements. See the scope rule in the trace of any in-scope passenger.</p> : null}
          {selected.entitlements.map((e) => (
            <details key={e.id} className="mt-4 rounded border border-line p-2">
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                <span>{KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className="flex items-center gap-2 font-mono tabular">{euros(e.amountCents)} <EntitlementStatus status={e.status} /></span>
              </summary>
              {e.needsHumanCheckReason ? <p className="mt-2 text-xs text-amber">Needs check: {e.needsHumanCheckReason}</p> : null}
              <ol className="mt-2 space-y-2 text-xs">
                {e.trace.map((s, i) => (
                  <li key={i}>
                    <span className="font-mono text-amber">{s.ruleId}</span> <span className="text-muted">{rules[s.ruleId]?.kind === "POLICY" ? "(Demo Air policy)" : rules[s.ruleId]?.title}</span>
                    <p>{s.outcome}</p>
                    <p className="font-mono text-muted break-all">{JSON.stringify(s.inputs)}</p>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </aside>
      ) : null}
    </div>
  );
}
