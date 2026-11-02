import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { sandboxStatus } from "@/lib/paypal/config";

// Reports whether the database answers and whether PayPal is pointed at the sandbox.
// Never includes secrets or connection strings.
export async function GET() {
  await connection();

  let db: "up" | "down" | "not_configured" = "not_configured";
  let dbLatencyMs: number | null = null;
  if (process.env.DATABASE_URL) {
    const started = Date.now();
    try {
      await getDb().$queryRaw`SELECT 1`;
      db = "up";
      dbLatencyMs = Date.now() - started;
    } catch {
      db = "down";
    }
  }

  const paypal = sandboxStatus();
  const ok = db === "up" && paypal === "sandbox";
  return Response.json(
    { ok, db, dbLatencyMs, paypal, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
