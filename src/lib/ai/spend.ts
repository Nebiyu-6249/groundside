// Spend log (AiCall table) and the daily budget cap (SPEC 8.5).

import type { PrismaClient } from "@/generated/prisma/client";
import type { AiComponent } from "./config";

export interface AiCallRecord {
  component: AiComponent;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  usedFixture: boolean;
  latencyMs: number;
}

export interface SpendLog {
  /** Spend since 00:00 UTC today. */
  todayUsd(): Promise<number>;
  record(call: AiCallRecord): Promise<void>;
}

export function prismaSpendLog(db: PrismaClient): SpendLog {
  return {
    async todayUsd() {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const agg = await db.aiCall.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: start } } });
      return agg._sum.costUsd ?? 0;
    },
    async record(call) {
      await db.aiCall.create({ data: call });
    },
  };
}

export function memorySpendLog(startUsd = 0): SpendLog & { calls: AiCallRecord[] } {
  const calls: AiCallRecord[] = [];
  return {
    calls,
    async todayUsd() {
      return startUsd + calls.reduce((s, c) => s + c.costUsd, 0);
    },
    async record(call) {
      calls.push(call);
    },
  };
}
