-- #237 retention purge role and created_at index. #242 method CHECK.
-- scripts/migrate.mjs applies this file inside BEGIN/COMMIT, and so does
-- src/server/db/migrate.ts. CREATE INDEX CONCURRENTLY cannot run in a
-- transaction, so the index is a plain CREATE INDEX.
--
-- audit_purge is NOLOGIN and has only SELECT, DELETE on audit_events.
-- This file never runs CREATE ROLE. On Azure PG flexible server the
-- migrator has no CREATEROLE, and a failed CREATE ROLE would 503 boot.
-- The role must already exist, be NOLOGIN, and have exactly one member:
-- the migrator (CURRENT_USER while this file runs). The runtime role
-- clockinoff-prod is not a member and is not granted DELETE.
DO $$
DECLARE
  migrator_name text := current_user;
  member_count integer;
  migrator_is_member boolean;
  can_login boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_purge') THEN
    RAISE EXCEPTION
      'audit_purge does not exist. Pre-create it out of band before migrating: CREATE ROLE audit_purge NOLOGIN; GRANT audit_purge TO "%";',
      migrator_name;
  END IF;

  EXECUTE 'REVOKE ALL ON TABLE audit_events FROM audit_purge';
  EXECUTE 'GRANT SELECT, DELETE ON TABLE audit_events TO audit_purge';

  SELECT rolcanlogin INTO can_login
    FROM pg_roles
   WHERE rolname = 'audit_purge';
  IF can_login THEN
    RAISE EXCEPTION
      'audit_purge must be NOLOGIN. Out of band: ALTER ROLE audit_purge NOLOGIN;';
  END IF;

  SELECT count(*) INTO member_count
    FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid = m.roleid
   WHERE granted.rolname = 'audit_purge';

  SELECT EXISTS (
    SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles granted ON granted.oid = m.roleid
      JOIN pg_roles member ON member.oid = m.member
     WHERE granted.rolname = 'audit_purge'
       AND member.rolname = migrator_name
  ) INTO migrator_is_member;

  IF member_count <> 1 OR NOT migrator_is_member THEN
    RAISE EXCEPTION
      'audit_purge must have exactly one member, the migrator "%". Out of band: revoke other members, then GRANT audit_purge TO "%";',
      migrator_name, migrator_name;
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
