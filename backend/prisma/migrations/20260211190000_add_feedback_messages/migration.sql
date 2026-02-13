-- CreateEnum
CREATE TYPE "FeedbackTopic" AS ENUM ('BUG_REPORT', 'EARLY_ACCESS', 'PARTNERSHIP');

-- CreateTable
CREATE TABLE "feedback_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" "FeedbackTopic" NOT NULL,
    "contact" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "feedback_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_messages_userId_idx" ON "feedback_messages"("userId");

-- CreateIndex
CREATE INDEX "feedback_messages_topic_idx" ON "feedback_messages"("topic");

-- CreateIndex
CREATE INDEX "feedback_messages_isRead_idx" ON "feedback_messages"("isRead");

-- CreateIndex
CREATE INDEX "feedback_messages_createdAt_idx" ON "feedback_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "feedback_messages" ADD CONSTRAINT "feedback_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
