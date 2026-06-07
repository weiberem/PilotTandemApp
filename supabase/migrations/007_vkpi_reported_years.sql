-- Track which years the pilot has already reported flights to VKPI for.
-- Stored as a JSONB array of integers (years) on the pilot row.
-- A year only enters this list when the pilot explicitly toggles
-- "Flüge gemeldet" on the Rechnung & Stats page; until then the VKPI
-- reminder is hidden by default and only appears once the year is fully
-- in the past.

alter table pilots
  add column if not exists vkpi_reported_years jsonb not null default '[]'::jsonb;
