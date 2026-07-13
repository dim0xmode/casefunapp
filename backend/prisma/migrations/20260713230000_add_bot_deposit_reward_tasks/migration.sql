-- Add BOT Chain deposit-based RewardTaskType enum values.
-- Postgres requires ALTER TYPE ADD VALUE to run outside a transaction,
-- so we use IF NOT EXISTS to make the migration idempotent / replay-safe.
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_AMOUNT_BOT';
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DEPOSIT_COUNT_BOT';
