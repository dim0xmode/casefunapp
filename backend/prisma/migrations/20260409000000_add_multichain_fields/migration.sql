-- AlterTable: User -- add TON wallet fields
ALTER TABLE "users" ADD COLUMN "tonAddress" TEXT;
ALTER TABLE "users" ADD COLUMN "tonLinkedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_tonAddress_key" ON "users"("tonAddress");

-- AlterTable: Case -- add chain type and TON token address
ALTER TABLE "cases" ADD COLUMN "chainType" TEXT NOT NULL DEFAULT 'EVM';
ALTER TABLE "cases" ADD COLUMN "tonTokenAddress" TEXT;

-- AlterTable: Claim -- add chain type
ALTER TABLE "claims" ADD COLUMN "chainType" TEXT NOT NULL DEFAULT 'EVM';
