// npm run e2e -- [--scenario=A]
// Runs the Quick run end to end against the PayPal sandbox, through the same functions the
// pages call: AI assessment, approval, scripted passenger responses, payouts, reconciliation.
// Use after npm run reset-demo. Real sandbox payouts are sent.

import { getDb } from "../src/lib/db";
import { runAssessment } from "../src/lib/ops/assessment";
import { approveCompensation, signDenial } from "../src/lib/ops/decisions";
import { simulatePassengerResponses } from "../src/lib/ops/simulate";
import { payDisruption } from "../src/lib/payouts/orchestrator";
import { reconcileDisruption } from "../src/lib/payouts/reconcile";
import { FINAL_ITEM } from "../src/lib/payouts/transitions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const key = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1] ?? "A";
  const db = getDb();
  try {
    const d = await db.disruption.findFirstOrThrow({ where: { scenarioKey: key, isDemoData: true, judgeRunId: null } });
    const user = await db.user.findFirstOrThrow({ where: { role: "DUTY_MANAGER" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true } });
    const t0 = Date.now();

    const a = await runAssessment(db, d.id, { type: "SYSTEM" });
    console.log(`A1: ${a.shownRecommendation}${a.usedFixture ? " (cached)" : ""}, model ${a.model}, ${a.costUsd.toFixed(4)} USD`);

    if (a.shownRecommendation === "NO_COMPENSATION_HUMAN_MUST_DECIDE") {
      const r = await signDenial(db, user, d.id, { typedName: user.name, reason: "Dense freezing fog at departure with RVR below the reference value for the whole departure window (e2e test).", citations: ["REG-5-3", "REG-REC-14"] });
      console.log(`Decision: denial signed (${r.created ? "new" : "existing"})`);
    } else {
      const r = await approveCompensation(db, user, d.id, a.shownRecommendation === "PAY_COMPENSATION" ? undefined : "e2e test: approving after review");
      console.log(`Decision: approved (${r.created ? "new" : "existing"})`);
    }
    const again = await approveCompensation(db, user, d.id, "double click").catch((e: Error) => e.message);
    console.log(`Second approve (idempotency): ${typeof again === "string" ? again : again.created ? "CREATED A SECOND DECISION" : "no new decision"}`);

    const n = await simulatePassengerResponses(db, d.id);
    console.log(`Passengers responded: ${n}`);
    const paid = await payDisruption(db, d.id);
    console.log(`Payouts sent: ${paid.batches} batch(es), ${paid.items} item(s), ${paid.skippedForCap} over the cap`);
    const tSent = Date.now();

    for (let i = 0; i < 40; i++) {
      await sleep(6000);
      await reconcileDisruption(db, d.id, { force: true });
      const items = await db.payoutItem.findMany({ where: { entitlement: { passenger: { disruptionId: d.id } } }, select: { status: true } });
      const counts = items.reduce<Record<string, number>>((acc, it) => ({ ...acc, [it.status]: (acc[it.status] ?? 0) + 1 }), {});
      console.log(`  +${Math.round((Date.now() - tSent) / 1000)}s ${JSON.stringify(counts)}`);
      if (items.length && items.every((it) => FINAL_ITEM.has(it.status) || it.status === "UNCLAIMED")) break;
    }
    const firstPaid = await db.auditEvent.findFirst({ where: { action: "PAYOUT_ITEM_STATUS", summary: { contains: "to SUCCESS" }, createdAt: { gte: new Date(t0) } }, orderBy: { createdAt: "asc" } });
    if (firstPaid) console.log(`Decision to first passenger paid: ${Math.round((firstPaid.createdAt.getTime() - t0) / 1000)} s (includes the AI call)`);
    const ents = await db.entitlement.groupBy({ by: ["kind", "status"], where: { passenger: { disruptionId: d.id } }, _count: true, _sum: { amountCents: true } });
    for (const e of ents) console.log(`  ${e.kind.padEnd(28)} ${e.status.padEnd(18)} ${String(e._count).padStart(3)}  ${((e._sum.amountCents ?? 0) / 100).toFixed(2)} EUR`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
