// What a signed-in user may see (SPEC 13): a judge sees only their own run's disruptions; the
// owner and the shared demo duty manager see everything outside judge runs.

import { notFound } from "next/navigation";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionUser } from "./session";

/** Prisma filter for the disruptions this user may see. */
export function disruptionScope(user: Pick<SessionUser, "judgeRunId">) {
  return { judgeRunId: user.judgeRunId ?? null };
}

/** 404 unless the disruption exists and is visible to this user. */
export async function assertDisruptionAccess(db: PrismaClient, user: Pick<SessionUser, "judgeRunId">, disruptionId: string): Promise<void> {
  const n = await db.disruption.count({ where: { id: disruptionId, ...disruptionScope(user) } });
  if (n === 0) notFound();
}

export async function assertPassengerAccess(db: PrismaClient, user: Pick<SessionUser, "judgeRunId">, passengerId: string): Promise<string> {
  const p = await db.passenger.findFirst({ where: { id: passengerId, disruption: disruptionScope(user) }, select: { disruptionId: true } });
  if (!p) notFound();
  return p.disruptionId;
}
