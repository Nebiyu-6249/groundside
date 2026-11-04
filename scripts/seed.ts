// npm run seed [-- --full]       seed the owner's demo data (refuses if it already exists)
// npm run reset-demo [-- --full] remove the owner's demo data and seed it again
// --hosted (used by scripts/deploy-render.ts) requires DEMO_OPS_PASSWORD and prints the target host
// Quick run: 12 passengers per scenario. Full run: 180 (A) and 150 (B).

import { getDb } from "../src/lib/db";
import { resetDemo, seedDemo } from "../src/lib/demo/seed";

/** Host name only, so the operator can see which database is targeted without printing credentials. */
function databaseHost(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : "not set";
  } catch {
    return "unreadable";
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  const size = process.argv.includes("--full") ? "FULL" : "QUICK";
  const pool = (process.env.PAYPAL_POOL_RECEIVERS ?? "").split(/[\s,;]+/).filter(Boolean);
  const unregisteredPattern = process.env.PAYPAL_UNREGISTERED_PATTERN ?? "pax-{n}@example.com";
  if (process.argv.includes("--hosted")) {
    // A generated password would overwrite the local credentials file and be unknown to judges.
    if (!process.env.DEMO_OPS_PASSWORD) throw new Error("Set DEMO_OPS_PASSWORD in .env.hosted for the hosted demo");
    console.log(`Target database host: ${databaseHost(process.env.DATABASE_URL)}`);
  }
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
