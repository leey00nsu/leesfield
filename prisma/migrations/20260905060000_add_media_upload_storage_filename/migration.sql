-- Null preserves the filename used to presign historical pending sessions.
ALTER TABLE "MediaUploadSession" ADD COLUMN "storageFileName" TEXT;
