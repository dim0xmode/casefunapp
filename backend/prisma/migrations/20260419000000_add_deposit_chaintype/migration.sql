-- Add chainType to deposits so we can distinguish EVM vs TON top-ups.
ALTER TABLE "deposits" ADD COLUMN IF NOT EXISTS "chainType" TEXT NOT NULL DEFAULT 'EVM';
CREATE INDEX IF NOT EXISTS "deposits_chainType_idx" ON "deposits"("chainType");
