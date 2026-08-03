-- Hardening migration (audit fixes). All changes are additive and backfilled so
-- existing rows keep working and no data is lost.

-- 1. JWT invalidation on logout: a per-user token version. A JWT carries the
--    version it was signed with; bumping this column (on logout) invalidates
--    every token issued before the bump. Existing tokens have no version claim
--    and are treated as version 0, so this deploy does NOT force a re-login.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- 2. Soft delete for expenses: keep an audit trail instead of hard-deleting.
--    NULL = live; a timestamp = deleted. Every expense read filters deleted_at
--    IS NULL, so balances/stats ignore deleted rows.
ALTER TABLE "expenses" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "expenses_deleted_at_idx" ON "expenses"("deleted_at");

-- 3. Idempotency for expense creation: an optional client-supplied key. A unique
--    index makes a duplicate retry collide instead of inserting a second row.
--    Nullable, so legacy requests without a key are unaffected (many NULLs are
--    allowed by a Postgres unique index).
ALTER TABLE "expenses" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "expenses_idempotency_key_key" ON "expenses"("idempotency_key");
