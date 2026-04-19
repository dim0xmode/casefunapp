-- Allow admins to exclude legacy / outlier case ledgers from RTU metrics
-- aggregations without deleting historical data.
ALTER TABLE "rtu_ledgers" ADD COLUMN IF NOT EXISTS "excludedFromMetrics" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "rtu_ledgers" ADD COLUMN IF NOT EXISTS "excludedAt" TIMESTAMP(3);
ALTER TABLE "rtu_ledgers" ADD COLUMN IF NOT EXISTS "excludedReason" TEXT;
