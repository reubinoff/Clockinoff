-- Ship Billable/Billed (Quiet Pulse): default billable ON going forward,
-- add a `billed` flag under it, and enforce the invariant in the DB so a
-- broken client can never persist `billed=true, billable=false`.

ALTER TABLE "time_entries"
  ALTER COLUMN "billable" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "billed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Backfill: every pre-existing entry becomes billable=true, billed=false so
-- the new default matches the product model for legacy data too.
UPDATE "time_entries" SET "billable" = true WHERE "billable" = false;
--> statement-breakpoint
UPDATE "time_entries" SET "billed" = false WHERE "billed" IS DISTINCT FROM false;
--> statement-breakpoint
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_billed_requires_billable"
  CHECK ("billed" = false OR "billable" = true);
