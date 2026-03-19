ALTER TABLE "users"
ADD COLUMN "twitterId" TEXT,
ADD COLUMN "twitterUsername" TEXT,
ADD COLUMN "twitterName" TEXT,
ADD COLUMN "twitterLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_twitterId_key" ON "users"("twitterId");
