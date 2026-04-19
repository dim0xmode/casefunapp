-- Add new RewardTaskType enum values for deposit-based tasks.
-- Postgres requires ALTER TYPE ADD VALUE to run outside a transaction,
-- so we use IF NOT EXISTS to make the migration idempotent / replay-safe.
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_AMOUNT_EVM';
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_AMOUNT_TON';
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_COUNT_ANY';
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_COUNT_EVM';
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_COUNT_TON';

-- Optional Float target for amount-based deposit tasks (USDT). targetCount
-- stays as the integer target for count-based tasks (open cases, etc.).
ALTER TABLE "reward_tasks" ADD COLUMN IF NOT EXISTS "targetAmount" DOUBLE PRECISION;
