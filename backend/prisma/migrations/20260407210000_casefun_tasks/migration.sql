-- Add new enum values
ALTER TYPE "RewardTaskType" ADD VALUE 'OPEN_CASES';
ALTER TYPE "RewardTaskType" ADD VALUE 'OPEN_SPECIFIC_CASE';
ALTER TYPE "RewardTaskType" ADD VALUE 'DO_UPGRADES';
ALTER TYPE "RewardTaskType" ADD VALUE 'CREATE_BATTLES';
ALTER TYPE "RewardTaskType" ADD VALUE 'JOIN_BATTLES';
ALTER TYPE "RewardTaskType" ADD VALUE 'CLAIM_TOKENS';

-- Add new columns to reward_tasks
ALTER TABLE "reward_tasks" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'SOCIAL';
ALTER TABLE "reward_tasks" ADD COLUMN "targetCount" INTEGER;
ALTER TABLE "reward_tasks" ADD COLUMN "targetCaseId" TEXT;
ALTER TABLE "reward_tasks" ADD COLUMN "repeatIntervalHours" INTEGER;
ALTER TABLE "reward_tasks" ADD COLUMN "activeUntil" TIMESTAMP(3);

-- Remove unique constraint from reward_claims to allow repeatable task claims
DROP INDEX IF EXISTS "reward_claims_userId_taskId_key";

-- Add composite index for efficient lookups
CREATE INDEX "reward_claims_userId_taskId_idx" ON "reward_claims"("userId", "taskId");
