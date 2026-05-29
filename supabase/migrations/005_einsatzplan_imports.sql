-- Per-month Einsatzplan imports.
--
-- Shape:
--   {
--     "YYYY-MM": {
--       drive_link:     text,
--       file_id:        text,
--       file_name:      text | null,
--       schedule:       jsonb,   -- pilot's own schedule for this month
--       full_plan:      jsonb,   -- whole roster
--       last_synced_at: text (ISO 8601),
--       archived:       boolean
--     },
--     ...
--   }
--
-- Existing pilots.einsatzplan_schedule / einsatzplan_full_plan stay as the
-- "currently active" cache so /log smart pre-fill and the calendar overlay
-- don't need to change reading paths immediately.

alter table pilots
  add column if not exists einsatzplan_imports jsonb not null default '{}'::jsonb;
