// Audit trail (SPEC 10, AuditEvent): every decision, payout and passenger action is recorded.

import type { PrismaClient } from "@/generated/prisma/client";

export interface AuditInput {
  actorType: "USER" | "SYSTEM" | "AI" | "PAYPAL" | "PASSENGER";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  data?: unknown;
}

type Tx = Pick<PrismaClient, "auditEvent">;

export async function audit(db: Tx, e: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: { ...e, actorId: e.actorId ?? null, data: e.data === undefined ? undefined : JSON.parse(JSON.stringify(e.data)) },
  });
}
