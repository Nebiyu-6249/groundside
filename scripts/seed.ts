// npm run seed [-- --full]       seed the owner's demo data (refuses if it already exists)
// npm run reset-demo [-- --full] remove the owner's demo data and seed it again
// Quick run: 12 passengers per scenario. Full run: 180 (A) and 150 (B).

import { getDb } from "../src/lib/db";
import { resetDemo, seedDemo } from "../src/lib/demo/seed";

async function main() {
  const reset = process.argv.includes("--reset");
  const size = process.argv.includes("--full") ? "FULL" : "QUICK";
  const pool = (process.env.PAYPAL_POOL_RECEIVERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const unregisteredPattern = process.env.PAYPAL_UNREGISTERED_PATTERN ?? "pax-{n}@example.com";
  const db = getDb();
  try {
    if (reset) {
      const removed = await resetDemo(db);
      console.log(`Removed ${removed.disruptions} demo disruption(s)`);
    } else if ((await db.disruption.count({ where: { isDemoData: true, judgeRunId: null } })) > 0) {
      console.log("Demo data already exists. Run npm run reset-demo to replace it.");
      return;
    }
    const { users, scenarios } = await seedDemo(db, { size, pool, unregisteredPattern });
    for (const u of users) console.log(`User ${u}`);
    for (const r of scenarios) {
      console.log(`Scenario ${r.scenario}: ${r.passengers} passengers, ${r.entitlements} entitlements (${size.toLowerCase()} run)`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
