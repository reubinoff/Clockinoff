-- Google OAuth ("Continue with Google"): attach-on-verified-email flow.
-- Shaul account lock: one user per verified email. A Google-only user has
-- no password_hash; an email/password user who later signs in with Google
-- gets `google_sub` filled in without losing their password.
ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "google_sub" text;
--> statement-breakpoint
-- Partial unique index: `sub` is unique per user when set, but we don't
-- store a placeholder for password-only users so NULLs must stay allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_unique"
  ON "users" ("google_sub")
  WHERE "google_sub" IS NOT NULL;
--> statement-breakpoint
-- Belt + suspenders: either a password OR a linked Google identity must
-- exist. A user with neither can never sign in and shouldn't be creatable.
ALTER TABLE "users"
  ADD CONSTRAINT "users_has_credential"
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
