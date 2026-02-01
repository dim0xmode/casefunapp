-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('ACTIVE', 'BURNT');

-- AlterTable
ALTER TABLE "case_drops" ADD COLUMN     "image" TEXT;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "caseId" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "status" "InventoryStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "balance" SET DEFAULT 5000;

-- CreateIndex
CREATE INDEX "inventory_items_caseId_idx" ON "inventory_items"("caseId");

-- CreateIndex
CREATE INDEX "inventory_items_status_idx" ON "inventory_items"("status");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
