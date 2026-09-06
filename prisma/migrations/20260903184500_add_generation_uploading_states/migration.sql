-- PostgreSQL requires newly added enum values to commit before a later migration
-- can reference them from partial-index predicates.
ALTER TYPE "ImageGenerationStatus" ADD VALUE 'uploading' AFTER 'processing';
ALTER TYPE "ImageGenerationStatus" ADD VALUE 'cancelled' AFTER 'failed';
ALTER TYPE "VideoGenerationStatus" ADD VALUE 'uploading' AFTER 'processing';
ALTER TYPE "VideoGenerationStatus" ADD VALUE 'cancelled' AFTER 'failed';
ALTER TYPE "AudioGenerationStatus" ADD VALUE 'uploading' AFTER 'processing';
ALTER TYPE "AudioGenerationStatus" ADD VALUE 'cancelled' AFTER 'failed';
