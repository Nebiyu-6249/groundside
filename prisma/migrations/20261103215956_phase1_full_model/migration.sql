-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DUTY_MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "JudgeRunSize" AS ENUM ('QUICK', 'FULL');

-- CreateEnum
CREATE TYPE "AirportScope" AS ENUM ('EU261', 'OUT_OF_SCOPE', 'UK261_UNSUPPORTED');

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'DELAYED', 'CANCELLED', 'OPERATED');

-- CreateEnum
CREATE TYPE "DisruptionType" AS ENUM ('CANCELLATION', 'DELAY');

-- CreateEnum
CREATE TYPE "DisruptionStatus" AS ENUM ('DRAFT', 'EVIDENCE_READY', 'ASSESSED', 'APPROVED', 'DENIAL_SIGNED', 'PAYING', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('METAR', 'TAF', 'OPS_NOTE', 'MAINTENANCE_LOG', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceRole" AS ENUM ('DEPARTURE', 'ARRIVAL', 'PREV_DEPARTURE', 'PREV_ARRIVAL');

-- CreateEnum
CREATE TYPE "DecisionKind" AS ENUM ('APPROVE_COMPENSATION', 'DENY_COMPENSATION');

-- CreateEnum
CREATE TYPE "ReceiverKind" AS ENUM ('POOL', 'UNREGISTERED', 'JUDGE_SANDBOX', 'NONE');

-- CreateEnum
CREATE TYPE "FareType" AS ENUM ('PUBLIC', 'FREQUENT_FLYER_AWARD', 'STAFF_REDUCED_NOT_PUBLIC', 'FREE_OF_CHARGE');

-- CreateEnum
CREATE TYPE "PassengerChoice" AS ENUM ('UNDECIDED', 'REROUTING', 'REFUND');

-- CreateEnum
CREATE TYPE "PriorityReason" AS ENUM ('REDUCED_MOBILITY', 'UNACCOMPANIED_MINOR');

-- CreateEnum
CREATE TYPE "EntitlementKind" AS ENUM ('COMPENSATION', 'MEAL_ALLOWANCE', 'HOTEL_REIMBURSEMENT_CAP', 'TRANSPORT_REIMBURSEMENT_CAP', 'REFUND');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('PENDING_DECISION', 'READY', 'OFFERED', 'ACCEPTED', 'PAYING', 'PAID', 'NOT_OWED', 'NEEDS_HUMAN_CHECK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentChoice" AS ENUM ('NONE', 'PAYPAL', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PayoutKind" AS ENUM ('COMPENSATION', 'MEAL', 'RECEIPT');

-- CreateEnum
CREATE TYPE "ReceiptDecision" AS ENUM ('AUTO_APPROVED', 'HUMAN_REVIEW', 'REJECTED', 'APPROVED_BY_HUMAN');

-- CreateEnum
CREATE TYPE "OutboxKind" AS ENUM ('NOTICE', 'REMINDER');

-- CreateEnum
CREATE TYPE "QaRole" AS ENUM ('PASSENGER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'AI', 'PAYPAL', 'PASSENGER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeRun" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "size" "JudgeRunSize" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudgeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Airport" (
    "icao" TEXT NOT NULL,
    "iata" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "tz" TEXT NOT NULL,
    "scope" "AirportScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Airport_pkey" PRIMARY KEY ("icao")
);

-- CreateTable
CREATE TABLE "Airline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isCommunityCarrier" BOOLEAN NOT NULL,
    "policy" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aircraft" (
    "id" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "airlineId" TEXT NOT NULL,
    "aircraftId" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "schedDep" TIMESTAMP(3) NOT NULL,
    "schedArr" TIMESTAMP(3) NOT NULL,
    "actualDep" TIMESTAMP(3),
    "actualArrDoorOpen" TIMESTAMP(3),
    "status" "FlightStatus" NOT NULL,
    "previousFlightId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disruption" (
    "id" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "judgeRunId" TEXT,
    "scenarioKey" TEXT NOT NULL,
    "type" "DisruptionType" NOT NULL,
    "informedAt" TIMESTAMP(3),
    "opsNote" TEXT NOT NULL,
    "maintenanceLog" TEXT,
    "status" "DisruptionStatus" NOT NULL DEFAULT 'DRAFT',
    "isDemoData" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disruption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "disruptionId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "airportIcao" TEXT,
    "role" "EvidenceRole",
    "raw" TEXT NOT NULL,
    "parsed" JSONB,
    "sourceUrl" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" TEXT NOT NULL,
    "disruptionId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "airportIcao" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fact_pkey" PRIMARY KEY ("disruptionId","id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "disruptionId" TEXT NOT NULL,
    "component" TEXT NOT NULL DEFAULT 'A1',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "validation" JSONB NOT NULL,
    "shownRecommendation" TEXT NOT NULL,
    "modelRecommendation" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "usedFixture" BOOLEAN NOT NULL DEFAULT false,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "disruptionId" TEXT NOT NULL,
    "kind" "DecisionKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "typedName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "citations" TEXT[],
    "differsFromAi" BOOLEAN NOT NULL DEFAULT false,
    "differsReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "disruptionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayEmail" TEXT,
    "payoutReceiver" TEXT,
    "receiverKind" "ReceiverKind" NOT NULL DEFAULT 'NONE',
    "fareType" "FareType" NOT NULL,
    "confirmedReservation" BOOLEAN NOT NULL DEFAULT true,
    "checkedInOnTime" BOOLEAN NOT NULL DEFAULT true,
    "firstDeparture" TEXT NOT NULL,
    "finalDestination" TEXT NOT NULL,
    "schedArrFinal" TIMESTAMP(3) NOT NULL,
    "arrFinalDoorOpen" TIMESTAMP(3),
    "rerouting" JSONB,
    "choice" "PassengerChoice" NOT NULL DEFAULT 'UNDECIDED',
    "priorityReason" "PriorityReason",
    "overnightStayNecessary" BOOLEAN NOT NULL DEFAULT false,
    "journeyNoLongerServesPurpose" BOOLEAN NOT NULL DEFAULT false,
    "manifestIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "kind" "EntitlementKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "EntitlementStatus" NOT NULL,
    "trace" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "needsHumanCheckReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paymentChoice" "PaymentChoice" NOT NULL DEFAULT 'NONE',
    "paypalEmail" TEXT,
    "consentTextVersion" TEXT,
    "consentAt" TIMESTAMP(3),
    "ibanLast4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "senderBatchId" TEXT NOT NULL,
    "paypalBatchId" TEXT,
    "kind" "PayoutKind" NOT NULL,
    "status" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "receiptId" TEXT,
    "senderItemId" TEXT NOT NULL,
    "paypalItemId" TEXT,
    "receiver" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "transactionId" TEXT,
    "lastError" TEXT,
    "finalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "pHash" TEXT,
    "extracted" JSONB,
    "checks" JSONB,
    "decision" "ReceiptDecision",
    "approvedCents" INTEGER,
    "reviewerId" TEXT,
    "demoDateOverride" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "disruptionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "citations" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "noticeId" TEXT,
    "renderedText" TEXT NOT NULL,
    "kind" "OutboxKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaMessage" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "role" "QaRole" NOT NULL,
    "text" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "usedFixture" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "JudgeRun_expiresAt_idx" ON "JudgeRun"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_iata_key" ON "Airport"("iata");

-- CreateIndex
CREATE UNIQUE INDEX "Airline_code_key" ON "Airline"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Aircraft_registration_key" ON "Aircraft"("registration");

-- CreateIndex
CREATE INDEX "Flight_flightNumber_schedDep_idx" ON "Flight"("flightNumber", "schedDep");

-- CreateIndex
CREATE INDEX "Disruption_scenarioKey_idx" ON "Disruption"("scenarioKey");

-- CreateIndex
CREATE INDEX "Disruption_judgeRunId_idx" ON "Disruption"("judgeRunId");

-- CreateIndex
CREATE INDEX "Evidence_disruptionId_idx" ON "Evidence"("disruptionId");

-- CreateIndex
CREATE INDEX "Assessment_disruptionId_idx" ON "Assessment"("disruptionId");

-- CreateIndex
CREATE INDEX "Decision_disruptionId_idx" ON "Decision"("disruptionId");

-- CreateIndex
CREATE INDEX "Passenger_bookingId_idx" ON "Passenger"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Passenger_disruptionId_manifestIndex_key" ON "Passenger"("disruptionId", "manifestIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_passengerId_kind_key" ON "Entitlement"("passengerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_tokenHash_key" ON "Offer"("tokenHash");

-- CreateIndex
CREATE INDEX "Offer_passengerId_idx" ON "Offer"("passengerId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_senderBatchId_key" ON "PayoutBatch"("senderBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_paypalBatchId_key" ON "PayoutBatch"("paypalBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_senderItemId_key" ON "PayoutItem"("senderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_paypalItemId_key" ON "PayoutItem"("paypalItemId");

-- CreateIndex
CREATE INDEX "PayoutItem_entitlementId_idx" ON "PayoutItem"("entitlementId");

-- CreateIndex
CREATE INDEX "Receipt_sha256_idx" ON "Receipt"("sha256");

-- CreateIndex
CREATE INDEX "Receipt_passengerId_idx" ON "Receipt"("passengerId");

-- CreateIndex
CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_origin_fkey" FOREIGN KEY ("origin") REFERENCES "Airport"("icao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_destination_fkey" FOREIGN KEY ("destination") REFERENCES "Airport"("icao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_previousFlightId_fkey" FOREIGN KEY ("previousFlightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disruption" ADD CONSTRAINT "Disruption_judgeRunId_fkey" FOREIGN KEY ("judgeRunId") REFERENCES "JudgeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passenger" ADD CONSTRAINT "Passenger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passenger" ADD CONSTRAINT "Passenger_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "Entitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_disruptionId_fkey" FOREIGN KEY ("disruptionId") REFERENCES "Disruption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaMessage" ADD CONSTRAINT "QaMessage_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Added by hand (docs/SPEC.md 9.6 and 10): at most one active payout item per entitlement.
-- An item stops being active when PayPal reports a final status in which no money reached the
-- passenger (FAILED, RETURNED, BLOCKED, REFUNDED, REVERSED, CANCELED), so a retry may create a
-- new item. Prisma cannot express a WHERE clause on a unique index, hence raw SQL.
CREATE UNIQUE INDEX "PayoutItem_one_active_per_entitlement"
  ON "PayoutItem" ("entitlementId")
  WHERE "status" NOT IN ('FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'CANCELED');
