-- CreateEnum
CREATE TYPE "RewardTaskType" AS ENUM ('LINK_TWITTER', 'LINK_TELEGRAM', 'FOLLOW_TWITTER', 'SUBSCRIBE_TELEGRAM', 'LIKE_TWEET', 'REPOST_TWEET', 'COMMENT_TWEET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "twitterAccessToken" TEXT,
ADD COLUMN "twitterRefreshToken" TEXT,
ADD COLUMN "rewardPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reward_tasks" (
    "id" TEXT NOT NULL,
    "type" "RewardTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetUrl" TEXT,
    "reward" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reward" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_tasks_isActive_idx" ON "reward_tasks"("isActive");
CREATE INDEX "reward_tasks_type_idx" ON "reward_tasks"("type");
CREATE INDEX "reward_tasks_createdById_idx" ON "reward_tasks"("createdById");

-- CreateIndex
CREATE INDEX "reward_claims_userId_idx" ON "reward_claims"("userId");
CREATE INDEX "reward_claims_taskId_idx" ON "reward_claims"("taskId");
CREATE UNIQUE INDEX "reward_claims_userId_taskId_key" ON "reward_claims"("userId", "taskId");

-- AddForeignKey
ALTER TABLE "reward_tasks" ADD CONSTRAINT "reward_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "reward_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default reward tasks
INSERT INTO "reward_tasks" ("id", "type", "title", "description", "reward", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('default_link_twitter', 'LINK_TWITTER', 'Link X / Twitter', 'Connect your X account to your profile', 1, true, true, 0, NOW(), NOW()),
  ('default_link_telegram', 'LINK_TELEGRAM', 'Link Telegram', 'Connect your Telegram account to your profile', 1, true, true, 1, NOW(), NOW()),
  ('default_follow_twitter', 'FOLLOW_TWITTER', 'Follow @casefunnet', 'Follow our official X account', 1, true, true, 2, NOW(), NOW()),
  ('default_sub_telegram', 'SUBSCRIBE_TELEGRAM', 'Join Telegram channel', 'Subscribe to our Telegram community', 1, true, true, 3, NOW(), NOW());
