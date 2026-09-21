-- Prisma applies a migration file in a transaction, while PostgreSQL forbids
-- CREATE INDEX CONCURRENTLY in a transaction. The canonical release command
-- runs scripts/production/create-history-search-indexes.mjs immediately after
-- migrate deploy to build the indexes in separate sessions without blocking
-- generation writes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
