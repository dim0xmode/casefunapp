-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "mintedAt" TIMESTAMP(3),
ADD COLUMN     "tokenAddress" TEXT,
ADD COLUMN     "tokenDecimals" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "totalSupply" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedTxHash" TEXT;

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "amountEth" DOUBLE PRECISION NOT NULL,
    "amountUsdt" DOUBLE PRECISION NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "blockNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposits_txHash_key" ON "deposits"("txHash");

-- CreateIndex
CREATE INDEX "deposits_userId_idx" ON "deposits"("userId");

-- CreateIndex
CREATE INDEX "claims_userId_idx" ON "claims"("userId");

-- CreateIndex
CREATE INDEX "claims_caseId_idx" ON "claims"("caseId");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
