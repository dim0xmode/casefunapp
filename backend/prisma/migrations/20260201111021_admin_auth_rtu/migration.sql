-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'MODERATOR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "tokenTicker" TEXT,
    "tokenPrice" DOUBLE PRECISION,
    "price" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "rtu" DOUBLE PRECISION NOT NULL DEFAULT 96,
    "openDurationHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_drops" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "case_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_openings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "wonDropId" TEXT NOT NULL,
    "wonValue" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opponentId" TEXT,
    "result" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "wonValue" DOUBLE PRECISION NOT NULL,
    "wonItems" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_nonces" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rtu_ledgers" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenPriceUsdt" DOUBLE PRECISION NOT NULL,
    "rtuPercent" DOUBLE PRECISION NOT NULL,
    "totalSpentUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTokenIssued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bufferDebtToken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rtu_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rtu_events" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT,
    "caseId" TEXT NOT NULL,
    "userId" TEXT,
    "tokenSymbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deltaSpentUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deltaToken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rtu_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "users_walletAddress_idx" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "cases_createdById_idx" ON "cases"("createdById");

-- CreateIndex
CREATE INDEX "case_drops_caseId_idx" ON "case_drops"("caseId");

-- CreateIndex
CREATE INDEX "case_openings_userId_idx" ON "case_openings"("userId");

-- CreateIndex
CREATE INDEX "case_openings_caseId_idx" ON "case_openings"("caseId");

-- CreateIndex
CREATE INDEX "inventory_items_userId_idx" ON "inventory_items"("userId");

-- CreateIndex
CREATE INDEX "transactions_userId_idx" ON "transactions"("userId");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "battles_userId_idx" ON "battles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "wallet_nonces_walletAddress_idx" ON "wallet_nonces"("walletAddress");

-- CreateIndex
CREATE INDEX "wallet_nonces_expiresAt_idx" ON "wallet_nonces"("expiresAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminId_idx" ON "admin_audit_logs"("adminId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_key" ON "site_settings"("key");

-- CreateIndex
CREATE INDEX "rtu_ledgers_caseId_idx" ON "rtu_ledgers"("caseId");

-- CreateIndex
CREATE INDEX "rtu_ledgers_tokenSymbol_idx" ON "rtu_ledgers"("tokenSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "rtu_ledgers_caseId_tokenSymbol_key" ON "rtu_ledgers"("caseId", "tokenSymbol");

-- CreateIndex
CREATE INDEX "rtu_events_caseId_idx" ON "rtu_events"("caseId");

-- CreateIndex
CREATE INDEX "rtu_events_ledgerId_idx" ON "rtu_events"("ledgerId");

-- CreateIndex
CREATE INDEX "rtu_events_userId_idx" ON "rtu_events"("userId");

-- CreateIndex
CREATE INDEX "rtu_events_tokenSymbol_idx" ON "rtu_events"("tokenSymbol");

-- CreateIndex
CREATE INDEX "rtu_events_type_idx" ON "rtu_events"("type");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_drops" ADD CONSTRAINT "case_drops_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_openings" ADD CONSTRAINT "case_openings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battles" ADD CONSTRAINT "battles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rtu_ledgers" ADD CONSTRAINT "rtu_ledgers_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rtu_events" ADD CONSTRAINT "rtu_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rtu_events" ADD CONSTRAINT "rtu_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rtu_events" ADD CONSTRAINT "rtu_events_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "rtu_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
