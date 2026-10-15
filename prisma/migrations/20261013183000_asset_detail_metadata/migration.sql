ALTER TABLE "MediaAsset"
  ADD COLUMN "classification" TEXT,
  ADD COLUMN "displayVersion" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "managementStatus" TEXT,
  ADD CONSTRAINT "MediaAsset_classification_check" CHECK ("classification" IN ('character', 'location', 'prop')),
  ADD CONSTRAINT "MediaAsset_managementStatus_check" CHECK ("managementStatus" IN ('draft', 'active', 'archived')),
  ADD CONSTRAINT "MediaAsset_displayVersion_length_check" CHECK (char_length("displayVersion") <= 64),
  ADD CONSTRAINT "MediaAsset_description_length_check" CHECK (char_length("description") <= 2000);
