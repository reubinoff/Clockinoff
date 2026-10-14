-- #219. User-agent and the session id hash travel with the audit row.
-- Both are set on INSERT. 0008's column UPDATE grant stays
-- status, result, completed_at — these columns are not updatable
-- by the runtime role.
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "user_agent" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "session_id_hash" text;
