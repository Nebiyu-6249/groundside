-- One decision per disruption (docs/SPEC.md 9.6: approve actions are idempotent).
-- Written by hand because `prisma migrate dev` needs an interactive terminal to confirm
-- adding a unique constraint. The plain index is replaced by the unique one.
DROP INDEX IF EXISTS "Decision_disruptionId_idx";
CREATE UNIQUE INDEX "Decision_disruptionId_key" ON "Decision"("disruptionId");
