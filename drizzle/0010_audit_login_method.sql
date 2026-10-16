-- #238. Login success and failure rows record password vs google.
-- Nullable: register, logout, and admin actions leave it null.
-- Insert-only. 0008's column UPDATE grant stays status, result, completed_at.
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "method" text;
