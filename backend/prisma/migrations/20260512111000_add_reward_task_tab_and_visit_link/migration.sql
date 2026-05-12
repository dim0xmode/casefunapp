-- Add new enum value for free-form "open this URL" tasks (partner links etc.)
ALTER TYPE "RewardTaskType" ADD VALUE IF NOT EXISTS 'VISIT_LINK';

-- Add tab column so admins can route any task to the Rewards or Partnerships
-- tab. Default keeps every existing row in the legacy Rewards tab.
ALTER TABLE "reward_tasks"
  ADD COLUMN IF NOT EXISTS "tab" TEXT NOT NULL DEFAULT 'REWARDS';

CREATE INDEX IF NOT EXISTS "reward_tasks_tab_idx" ON "reward_tasks"("tab");
