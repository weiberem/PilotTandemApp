-- Cache the full Skywings roster per pilot (same plan, but we store it
-- per-pilot row so we don't add a new shared table and keep RLS simple).
-- Shape: { month: "YYYY-MM-01", days: { "YYYY-MM-DD": { date, pilots: [{name, period}] } } }

alter table pilots
  add column if not exists einsatzplan_full_plan jsonb;
