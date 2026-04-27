-- Add DAILY_STREAK reward task type. ALTER TYPE ADD VALUE must be run
-- outside a transaction; IF NOT EXISTS keeps the migration replay-safe.
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'DAILY_STREAK';

-- Seed a single default Daily Streak task so the feature is live as soon as
-- the migration runs. The reward field is informational only — the actual
-- reward is computed at claim time as `streakDay` (1..7 CFP).
INSERT INTO "reward_tasks" (
  "id", "type", "title", "description", "reward",
  "isDefault", "isActive", "sortOrder",
  "category", "createdAt", "updatedAt"
)
SELECT
  'daily_streak_default',
  'DAILY_STREAK',
  'Daily Login Streak',
  'Claim every day to grow your streak: 1 CFP on day 1, 2 on day 2 … 7 on day 7. Skip a day and the streak resets.',
  1,
  true, true, -10,
  'DAILY', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "reward_tasks" WHERE "type" = 'DAILY_STREAK'
);
