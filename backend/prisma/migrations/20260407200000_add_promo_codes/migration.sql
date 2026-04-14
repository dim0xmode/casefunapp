CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usesPerUser" INTEGER NOT NULL DEFAULT 1,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "fundingUserId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promo_activations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_activations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");
CREATE INDEX "promo_codes_code_idx" ON "promo_codes"("code");
CREATE INDEX "promo_codes_isActive_idx" ON "promo_codes"("isActive");
CREATE INDEX "promo_activations_userId_idx" ON "promo_activations"("userId");
CREATE INDEX "promo_activations_promoId_idx" ON "promo_activations"("promoId");

ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_fundingUserId_fkey" FOREIGN KEY ("fundingUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promo_activations" ADD CONSTRAINT "promo_activations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promo_activations" ADD CONSTRAINT "promo_activations_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
