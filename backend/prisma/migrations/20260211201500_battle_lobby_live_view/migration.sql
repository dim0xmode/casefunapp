-- AlterEnum
ALTER TYPE "BattleLobbyStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "battle_lobbies"
ADD COLUMN "mode" TEXT,
ADD COLUMN "roundsJson" JSONB,
ADD COLUMN "winnerName" TEXT,
ADD COLUMN "startedAt" TIMESTAMP(3);
