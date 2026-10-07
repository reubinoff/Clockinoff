-- #195 QA seeds. Existing rows stay is_test=false except emails on the
-- #193 allowlist, which are backfilled true. Pattern (lowercased email):
-- ^(gabi|dana|ariel)\.qa\.[a-z0-9.+_-]+@primesec\.ai$
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_test" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "users"
SET "is_test" = true
WHERE lower("email") ~ '^(gabi|dana|ariel)\.qa\.[a-z0-9.+_-]+@primesec\.ai$';
