-- #237 retention purge role and created_at index. #242 method CHECK.
-- scripts/migrate.mjs applies this file inside BEGIN/COMMIT, and so does
-- src/server/db/migrate.ts. CREATE INDEX CONCURRENTLY cannot run in a
-- transaction, so the index is a plain CREATE INDEX.
--
-- audit_purge is NOLOGIN and has only SELECT, DELETE on audit_events.
-- The migrator (CURRENT_USER while this file runs) receives membership
-- so startup can SET LOCAL ROLE audit_purge. The runtime role
-- clockinoff-prod is not granted DELETE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_purge') THEN
    CREATE ROLE audit_purge NOLOGIN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE audit_events FROM audit_purge';
  EXECUTE 'GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge';
  EXECUTE format('GRANT audit_purge TO %I', CURRENT_USER);
END $$;
--> statement-breakpoint
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
