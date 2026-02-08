-- Add image display metadata for cases and avatars
ALTER TABLE "users" ADD COLUMN "avatarMeta" JSONB;
ALTER TABLE "cases" ADD COLUMN "imageMeta" JSONB;
