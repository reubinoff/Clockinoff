-- #237 retention purge role and created_at index. #242 method CHECK.
-- scripts/migrate.mjs applies this file inside BEGIN/COMMIT, and so does
-- src/server/db/migrate.ts. CREATE INDEX CONCURRENTLY cannot run in a
-- transaction, so the index is a plain CREATE INDEX.
--
-- audit_purge is NOLOGIN and has only SELECT, DELETE on audit_events.
-- Membership goes to the migrator (CURRENT_USER while this file runs)
-- so startup can SET LOCAL ROLE audit_purge. The runtime role
-- clockinoff-prod is not a member and is not granted DELETE.
--
-- Azure PG flexible server: the migrator may lack CREATEROLE. If
-- audit_purge already exists, creation is a no-op. If it does not and
-- CREATE ROLE is denied, this raises a clear pre-create error instead
-- of a bare permission failure.
DO $$
DECLARE
  migrator_name text := current_user;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_purge') THEN
    BEGIN
      CREATE ROLE audit_purge NOLOGIN;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION
          'audit_purge does not exist and role "%" has no CREATEROLE. Pre-create it out of band before migrating: CREATE ROLE audit_purge NOLOGIN; GRANT audit_purge TO "%";',
          migrator_name, migrator_name;
    END;
  END IF;

  EXECUTE 'REVOKE ALL ON TABLE audit_events FROM audit_purge';
  EXECUTE 'GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge';

  IF NOT EXISTS (
    SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles granted ON granted.oid = m.roleid
      JOIN pg_roles member ON member.oid = m.member
     WHERE granted.rolname = 'audit_purge'
       AND member.rolname = migrator_name
  ) THEN
    BEGIN
      EXECUTE format('GRANT audit_purge TO %I', migrator_name);
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION
          'audit_purge exists but role "%" cannot grant it to itself. Pre-create membership out of band: GRANT audit_purge TO "%";',
          migrator_name, migrator_name;
    END;
  END IF;
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
