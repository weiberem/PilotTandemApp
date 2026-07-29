-- Optional per-flight detail capture, toggled per pilot in Settings:
--   1. Takeoff / landing site
--   2. Passenger nationality (with an adaptive most-used ranking)
alter table pilots  add column if not exists track_sites        boolean not null default false;
alter table pilots  add column if not exists track_nationality  boolean not null default false;
-- Per-pilot pick counts { "China": 12, ... } driving the nationality ranking.
alter table pilots  add column if not exists nationality_counts jsonb   not null default '{}'::jsonb;

alter table flights add column if not exists takeoff_site          text;
alter table flights add column if not exists landing_site          text;
alter table flights add column if not exists passenger_nationality text;
