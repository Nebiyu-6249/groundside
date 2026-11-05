// Judge mode (SPEC 14): each judge gets a private copy of a scenario (Quick run), a duty-manager
// user scoped to it, and a 24-hour lifetime. Expired runs are removed whenever a new run starts.

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/users";
import { removeDisruptions, seedOneScenario } from "@/lib/demo/seed";
import type { ScenarioKey } from "@/lib/demo/scenarios";
import { audit } from "@/lib/ops/audit";
import { hit } from "@/lib/rate-limit";

export const JUDGE_RUN_HOURS = 24;

export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeError";
  }
}

export function judgeModeOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.JUDGE_MODE === "true";
}

function seedOptions(judgeRunId: string) {
  return {
    size: "QUICK" as const,
    pool: (process.env.PAYPAL_POOL_RECEIVERS ?? "").split(/[\s,;]+/).filter(Boolean),
    unregisteredPattern: process.env.PAYPAL_UNREGISTERED_PATTERN ?? "pax-{n}@example.com",
    judgeRunId,
  };
}

/** Removes judge runs past their expiry: their disruptions, payout records, users and the run. */
export async function cleanupJudgeRuns(db: PrismaClient): Promise<number> {
  const expired = await db.judgeRun.findMany({ where: { expiresAt: { lt: new Date() } }, select: { id: true } });
  if (expired.length === 0) return 0;
  const ids = expired.map((r) => r.id);
  await removeDisruptions(db, { isDemoData: true, judgeRunId: { in: ids } });
  await db.judgeRun.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

export async function startJudgeRun(db: PrismaClient, input: { ipHash: string; scenarioKey: ScenarioKey }): Promise<{ userId: string; disruptionId: string }> {
  if (!judgeModeOn()) throw new JudgeError("Judge mode is not enabled on this server.");
  const perHour = Number(process.env.MAX_JUDGE_RUNS_PER_HOUR ?? "5");
  const limit = await hit(db, `judge:${input.ipHash}`, Number.isFinite(perHour) && perHour > 0 ? perHour : 5, 3600);
  if (!limit.allowed) throw new JudgeError("You have started several demos in the last hour. Try again later, or sign in with the demo login in the README.");
  await cleanupJudgeRuns(db);
  const run = await db.judgeRun.create({ data: { ipHash: input.ipHash, scenarioKey: input.scenarioKey, size: "QUICK", expiresAt: new Date(Date.now() + JUDGE_RUN_HOURS * 3_600_000) } });
  let seeded;
  try {
    seeded = await seedOneScenario(db, input.scenarioKey, seedOptions(run.id));
  } catch (err) {
    // Leave nothing half-seeded behind.
    await removeDisruptions(db, { isDemoData: true, judgeRunId: run.id }).catch(() => undefined);
    await db.judgeRun.delete({ where: { id: run.id } }).catch(() => undefined);
    throw err;
  }
  const user = await db.user.create({
    data: {
      email: `judge-${run.id}@demo.groundside.test`,
      name: "Judge (demo)",
      // Nobody types this password: the judge is signed in by the start action.
      passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
      role: "DUTY_MANAGER",
      judgeRunId: run.id,
    },
  });
  await audit(db, { actorType: "SYSTEM", action: "JUDGE_RUN_STARTED", entityType: "Disruption", entityId: seeded.disruptionId, summary: `Judge demo started: private copy of scenario ${input.scenarioKey} (Quick run), removed after ${JUDGE_RUN_HOURS} hours` });
  return { userId: user.id, disruptionId: seeded.disruptionId };
}

/** "Reset this run": a fresh copy of the same scenario in the same run, for the same judge. */
export async function resetJudgeRun(db: PrismaClient, judgeRunId: string): Promise<string> {
  const run = await db.judgeRun.findUnique({ where: { id: judgeRunId } });
  if (!run) throw new JudgeError("This demo has expired. Start a new one from the home page.");
  await removeDisruptions(db, { isDemoData: true, judgeRunId: run.id });
  const seeded = await seedOneScenario(db, run.scenarioKey as ScenarioKey, seedOptions(run.id));
  await audit(db, { actorType: "SYSTEM", action: "JUDGE_RUN_RESET", entityType: "Disruption", entityId: seeded.disruptionId, summary: `Judge demo reset: fresh copy of scenario ${run.scenarioKey}` });
  return seeded.disruptionId;
}
