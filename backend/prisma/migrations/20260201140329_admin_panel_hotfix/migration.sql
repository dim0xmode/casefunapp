-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banReason" TEXT;

-- AddForeignKey
ALTER TABLE "case_openings" ADD CONSTRAINT "case_openings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
