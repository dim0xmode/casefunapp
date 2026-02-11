-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "payoutAt" TIMESTAMP(3),
ADD COLUMN     "payoutEth" DOUBLE PRECISION,
ADD COLUMN     "payoutPriceUsdt" DOUBLE PRECISION,
ADD COLUMN     "payoutTxHash" TEXT,
ADD COLUMN     "payoutUsdt" DOUBLE PRECISION;
