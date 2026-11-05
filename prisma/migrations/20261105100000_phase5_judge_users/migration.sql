-- Judge mode (SPEC 14): each judge run gets its own duty-manager user, scoped to that run and
-- removed with it.
ALTER TABLE "User" ADD COLUMN "judgeRunId" TEXT;
CREATE INDEX "User_judgeRunId_idx" ON "User"("judgeRunId");
ALTER TABLE "User" ADD CONSTRAINT "User_judgeRunId_fkey" FOREIGN KEY ("judgeRunId") REFERENCES "JudgeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
