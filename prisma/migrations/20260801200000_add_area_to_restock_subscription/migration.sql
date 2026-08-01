-- DropIndex
DROP INDEX IF EXISTS "RestockSubscription_productId_userId_key";

-- AlterTable
ALTER TABLE "RestockSubscription" ADD COLUMN "areaId" TEXT;

-- CreateIndex
CREATE INDEX "RestockSubscription_areaId_idx" ON "RestockSubscription"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "RestockSubscription_productId_userId_areaId_key" ON "RestockSubscription"("productId", "userId", "areaId");

-- AddForeignKey
ALTER TABLE "RestockSubscription" ADD CONSTRAINT "RestockSubscription_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
