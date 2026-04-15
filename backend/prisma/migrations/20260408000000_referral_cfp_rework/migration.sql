-- Change rewardPoints from Int to Float
ALTER TABLE "users" ALTER COLUMN "rewardPoints" SET DATA TYPE DOUBLE PRECISION USING "rewardPoints"::DOUBLE PRECISION;

-- Change reward_claims.reward from Int to Float
ALTER TABLE "reward_claims" ALTER COLUMN "reward" SET DATA TYPE DOUBLE PRECISION USING "reward"::DOUBLE PRECISION;

-- Make taskId optional
ALTER TABLE "reward_claims" ALTER COLUMN "taskId" DROP NOT NULL;

-- Add type column with default
ALTER TABLE "reward_claims" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'TASK';

-- Add metadata column
ALTER TABLE "reward_claims" ADD COLUMN "metadata" JSONB;
