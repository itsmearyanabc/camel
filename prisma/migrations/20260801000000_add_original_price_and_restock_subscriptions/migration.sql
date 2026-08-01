-- AlterTable
ALTER TABLE "Product" ADD COLUMN "originalPrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "RestockSubscription" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestockSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestockSubscription_productId_idx" ON "RestockSubscription"("productId");

-- CreateIndex
CREATE INDEX "RestockSubscription_userId_idx" ON "RestockSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RestockSubscription_productId_userId_key" ON "RestockSubscription"("productId", "userId");

-- AddForeignKey
ALTER TABLE "RestockSubscription" ADD CONSTRAINT "RestockSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockSubscription" ADD CONSTRAINT "RestockSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
