-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "feedback_messages"
ADD COLUMN "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "feedback_messages_status_idx" ON "feedback_messages"("status");

-- CreateIndex
CREATE INDEX "feedback_messages_userId_topic_createdAt_idx" ON "feedback_messages"("userId", "topic", "createdAt");
