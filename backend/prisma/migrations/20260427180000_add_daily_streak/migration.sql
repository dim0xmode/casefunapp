-- Add DAILY_STREAK reward task type. ALTER TYPE ADD VALUE must be run
-- outside a transaction; IF NOT EXISTS keeps the migration replay-safe.
-- Postgres also forbids using a freshly-added enum value within the same
-- transaction, so the seed INSERT lives in a follow-up migration.
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DAILY_STREAK';
