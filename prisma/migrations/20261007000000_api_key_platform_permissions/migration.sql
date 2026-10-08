-- Existing credentials keep their generation-only access.
ALTER TABLE "ApiKey" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]';
