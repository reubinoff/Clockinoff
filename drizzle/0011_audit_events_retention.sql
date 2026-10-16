-- #237 created_at index. #242 method CHECK.
-- scripts/migrate.mjs applies this file inside BEGIN/COMMIT, and so does
-- src/server/db/migrate.ts. CREATE INDEX CONCURRENTLY cannot run in a
-- transaction, so the index is a plain CREATE INDEX.
--
-- The retention delete is not in this file. scripts/migrate.mjs runs it
-- after migrations, as the migrator, which owns audit_events. There is
-- no separate purge role and no GRANT here. clockinoff-prod still has
-- no DELETE on audit_events (drizzle/0008_audit_events_grants.sql).
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx"
  ON "audit_events" ("created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE method IS NOT NULL
      AND method NOT IN ('password', 'google')
  ) THEN
    RAISE EXCEPTION 'audit_events.method has a value other than password or google';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_events_method_check'
      AND conrelid = 'public.audit_events'::regclass
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_method_check
      CHECK (method IS NULL OR method IN ('password', 'google'))
      NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE audit_events VALIDATE CONSTRAINT audit_events_method_check;
