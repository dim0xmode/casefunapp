-- CreateEnum
CREATE TYPE "RewardCaseStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RewardCaseCurrency" AS ENUM ('CFP', 'USDT', 'TEST_CFP', 'TEST_USDT');

-- CreateEnum
CREATE TYPE "RewardDropKind" AS ENUM ('USDT', 'CFT', 'NFT', 'TEST_USDT', 'TEST_CFT', 'TEST_NFT');

-- CreateEnum
CREATE TYPE "RewardCaseLimitMode" AS ENUM ('NONE', 'BY_OPENS', 'BY_DROP');

-- CreateTable
CREATE TABLE "reward_cases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "imageMeta" JSONB,
    "status" "RewardCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "openCurrency" "RewardCaseCurrency" NOT NULL,
    "openPrice" DOUBLE PRECISION NOT NULL,
    "prePrice" DOUBLE PRECISION,
    "chain" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "limitMode" "RewardCaseLimitMode" NOT NULL DEFAULT 'NONE',
    "limitTotal" DOUBLE PRECISION,
    "limitRemaining" DOUBLE PRECISION,
    "totalOpens" INTEGER NOT NULL DEFAULT 0,
    "totalPrePurchased" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_drops" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "RewardDropKind" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "color" TEXT NOT NULL DEFAULT '#9CA3AF',
    "image" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "nftChain" TEXT,
    "nftContract" TEXT,
    "nftMetadata" JSONB,

    CONSTRAINT "reward_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_pre_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "totalBought" INTEGER NOT NULL,
    "pricePaid" DOUBLE PRECISION NOT NULL,
    "currency" "RewardCaseCurrency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_pre_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_case_openings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "usedPrePurchase" BOOLEAN NOT NULL DEFAULT false,
    "pricePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" "RewardCaseCurrency" NOT NULL,
    "dropKind" "RewardDropKind" NOT NULL,
    "dropAmount" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_case_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_stacks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "RewardDropKind" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "claimedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastDropAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_stacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_nft_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "kind" "RewardDropKind" NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "color" TEXT NOT NULL DEFAULT '#9CA3AF',
    "tokenId" INTEGER,
    "contractAddress" TEXT,
    "chain" TEXT,
    "metadata" JSONB,
    "claimedAt" TIMESTAMP(3),
    "claimTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_nft_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_cases_status_idx" ON "reward_cases"("status");

-- CreateIndex
CREATE INDEX "reward_cases_createdById_idx" ON "reward_cases"("createdById");

-- CreateIndex
CREATE INDEX "reward_cases_startAt_idx" ON "reward_cases"("startAt");

-- CreateIndex
CREATE INDEX "reward_cases_endAt_idx" ON "reward_cases"("endAt");

-- CreateIndex
CREATE INDEX "reward_drops_caseId_idx" ON "reward_drops"("caseId");

-- CreateIndex
CREATE INDEX "reward_pre_purchases_userId_idx" ON "reward_pre_purchases"("userId");

-- CreateIndex
CREATE INDEX "reward_pre_purchases_caseId_idx" ON "reward_pre_purchases"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "reward_pre_purchases_userId_caseId_key" ON "reward_pre_purchases"("userId", "caseId");

-- CreateIndex
CREATE INDEX "reward_case_openings_userId_idx" ON "reward_case_openings"("userId");

-- CreateIndex
CREATE INDEX "reward_case_openings_caseId_idx" ON "reward_case_openings"("caseId");

-- CreateIndex
CREATE INDEX "reward_case_openings_dropId_idx" ON "reward_case_openings"("dropId");

-- CreateIndex
CREATE INDEX "reward_case_openings_timestamp_idx" ON "reward_case_openings"("timestamp");

-- CreateIndex
CREATE INDEX "reward_stacks_userId_idx" ON "reward_stacks"("userId");

-- CreateIndex
CREATE INDEX "reward_stacks_caseId_idx" ON "reward_stacks"("caseId");

-- CreateIndex
CREATE INDEX "reward_stacks_kind_idx" ON "reward_stacks"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "reward_stacks_userId_caseId_kind_key" ON "reward_stacks"("userId", "caseId", "kind");

-- CreateIndex
CREATE INDEX "reward_nft_items_userId_idx" ON "reward_nft_items"("userId");

-- CreateIndex
CREATE INDEX "reward_nft_items_caseId_idx" ON "reward_nft_items"("caseId");

-- CreateIndex
CREATE INDEX "reward_nft_items_dropId_idx" ON "reward_nft_items"("dropId");

-- AddForeignKey
ALTER TABLE "reward_cases" ADD CONSTRAINT "reward_cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_drops" ADD CONSTRAINT "reward_drops_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "reward_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_pre_purchases" ADD CONSTRAINT "reward_pre_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_pre_purchases" ADD CONSTRAINT "reward_pre_purchases_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "reward_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_case_openings" ADD CONSTRAINT "reward_case_openings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_case_openings" ADD CONSTRAINT "reward_case_openings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "reward_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_case_openings" ADD CONSTRAINT "reward_case_openings_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "reward_drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_stacks" ADD CONSTRAINT "reward_stacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_stacks" ADD CONSTRAINT "reward_stacks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "reward_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_nft_items" ADD CONSTRAINT "reward_nft_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_nft_items" ADD CONSTRAINT "reward_nft_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "reward_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_nft_items" ADD CONSTRAINT "reward_nft_items_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "reward_drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
