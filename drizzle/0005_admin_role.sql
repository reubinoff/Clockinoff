-- #142 Admin role and block status. Existing rows stay non-admin and
-- unblocked (`role` default 'user', `blocked_at` null). This is a flag on
-- the same users table, not a second application.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "blocked_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('user', 'admin'));
