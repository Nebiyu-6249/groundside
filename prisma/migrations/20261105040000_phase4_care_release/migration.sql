-- Care (meal allowances) can be released before the compensation decision (SPEC F6).
ALTER TABLE "Disruption" ADD COLUMN "careReleasedAt" TIMESTAMP(3);
