ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_start_before_end"
  CHECK (end_at IS NULL OR start_at < end_at);
