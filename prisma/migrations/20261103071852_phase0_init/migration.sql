-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYPAL', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "pnr" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "orderRequestId" TEXT,
    "captureRequestId" TEXT,
    "orderStatus" TEXT,
    "segments" JSONB,
    "isJudgeBooking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "paypalRefundId" TEXT,
    "requestId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "verified" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_pnr_key" ON "Booking"("pnr");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paypalOrderId_key" ON "Booking"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paypalCaptureId_key" ON "Booking"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_orderRequestId_key" ON "Booking"("orderRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_captureRequestId_key" ON "Booking"("captureRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paypalRefundId_key" ON "Refund"("paypalRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_requestId_key" ON "Refund"("requestId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_resourceId_idx" ON "WebhookEvent"("resourceId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
