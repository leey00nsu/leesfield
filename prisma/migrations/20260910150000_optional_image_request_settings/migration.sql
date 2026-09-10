-- Provider contracts need not declare these legacy request settings.
ALTER TABLE "ImageGeneration"
  ALTER COLUMN "aspectRatio" DROP NOT NULL,
  ALTER COLUMN "imageCount" DROP NOT NULL,
  ALTER COLUMN "steps" DROP NOT NULL;
