-- CreateEnum
CREATE TYPE "BattleLobbyStatus" AS ENUM ('OPEN', 'FINISHED');

-- CreateTable
CREATE TABLE "battle_lobbies" (
    "id" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "joinerUserId" TEXT,
    "hostName" TEXT NOT NULL,
    "joinerName" TEXT,
    "caseIds" JSONB NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "status" "BattleLobbyStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "battle_lobbies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battle_lobbies_hostUserId_idx" ON "battle_lobbies"("hostUserId");

-- CreateIndex
CREATE INDEX "battle_lobbies_joinerUserId_idx" ON "battle_lobbies"("joinerUserId");

-- CreateIndex
CREATE INDEX "battle_lobbies_status_idx" ON "battle_lobbies"("status");

-- CreateIndex
CREATE INDEX "battle_lobbies_createdAt_idx" ON "battle_lobbies"("createdAt");

-- AddForeignKey
ALTER TABLE "battle_lobbies" ADD CONSTRAINT "battle_lobbies_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_lobbies" ADD CONSTRAINT "battle_lobbies_joinerUserId_fkey" FOREIGN KEY ("joinerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
