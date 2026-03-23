ALTER TABLE "users"
ADD COLUMN "hasLinkedWallet" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "walletLinkedAt" TIMESTAMP(3),
ADD COLUMN "telegramId" TEXT,
ADD COLUMN "telegramUsername" TEXT,
ADD COLUMN "telegramFirstName" TEXT,
ADD COLUMN "telegramLastName" TEXT,
ADD COLUMN "telegramPhotoUrl" TEXT,
ADD COLUMN "telegramLinkedAt" TIMESTAMP(3);

UPDATE "users"
SET "walletLinkedAt" = COALESCE("walletLinkedAt", "createdAt")
WHERE "walletAddress" IS NOT NULL;

CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");
