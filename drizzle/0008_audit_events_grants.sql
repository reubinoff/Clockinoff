-- #219. Actor snapshot, targets with email, pending-then-result columns,
-- and the grants the runtime role needs. Prod default privileges do not
-- apply to tables the migrator creates, so these GRANTs are mandatory.
-- id is gen_random_uuid(); there is no sequence and no USAGE grant.
-- The runtime role must already exist. CI and the Vitest setup create
-- "clockinoff-prod" NOLOGIN before migrating. A missing role aborts
-- the migration unless clockinoff.allow_missing_app_role is 'on'.
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_email" text;
--> statement-breakpoint
UPDATE "audit_events" SET "actor_email" = '' WHERE "actor_email" IS NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_email" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "targets" jsonb;
--> statement-breakpoint
DO $$
BEGIN
  -- Retry-safe: a previous attempt may already have dropped target_ids.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_events'
      AND column_name = 'target_ids'
  ) THEN
    EXECUTE $upd$
      UPDATE audit_events
      SET targets = COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object('id', tid, 'email', NULL))
          FROM unnest(target_ids) AS tid
        ),
        '[]'::jsonb
      )
      WHERE targets IS NULL
    $upd$;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "targets" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" DROP COLUMN IF EXISTS "target_ids";
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "forwarded_for" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "status" text;
--> statement-breakpoint
UPDATE "audit_events" SET "status" = 'completed' WHERE "status" IS NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "result" jsonb;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "audit_events" SET "completed_at" = "created_at" WHERE "completed_at" IS NULL AND "status" = 'completed';
--> statement-breakpoint
REVOKE ALL ON TABLE "audit_events" FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clockinoff-prod') THEN
    IF current_setting('clockinoff.allow_missing_app_role', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'role "clockinoff-prod" does not exist; refusing to skip audit_events grants (set clockinoff.allow_missing_app_role=on to bypass)';
    END IF;
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE audit_events FROM "clockinoff-prod"';
  EXECUTE 'GRANT SELECT, INSERT ON audit_events TO "clockinoff-prod"';
  EXECUTE 'GRANT UPDATE (status, result, completed_at) ON audit_events TO "clockinoff-prod"';
END $$;
