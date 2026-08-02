-- AlterTable: crypto payment gateway tracking on Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerInvoiceId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(12,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidCurrency" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentExpiresAt" TIMESTAMP(3);

-- AlterTable: crypto payment gateway tracking on DepositRequest
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "providerInvoiceId" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(12,2);
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "paymentExpiresAt" TIMESTAMP(3);

-- CreateIndex
-- providerPaymentId is unique so a replayed IPN can never credit twice.
CREATE UNIQUE INDEX IF NOT EXISTS "Order_providerPaymentId_key" ON "Order"("providerPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "DepositRequest_providerPaymentId_key" ON "DepositRequest"("providerPaymentId");

CREATE INDEX IF NOT EXISTS "Order_providerInvoiceId_idx" ON "Order"("providerInvoiceId");
CREATE INDEX IF NOT EXISTS "DepositRequest_providerInvoiceId_idx" ON "DepositRequest"("providerInvoiceId");

-- Supports the reclaim cron that cancels abandoned PENDING_PAYMENT orders.
CREATE INDEX IF NOT EXISTS "Order_status_paymentExpiresAt_idx" ON "Order"("status", "paymentExpiresAt");
