-- Per-pilot switch for all Google integrations (Drive, Calendar, schedule import).
-- When false, the app hides/short-circuits every Google feature for that pilot.
alter table pilots add column if not exists google_enabled boolean not null default true;
comment on column pilots.google_enabled is
  'When false, all Google integrations (Drive, Calendar, schedule import) are hidden/disabled for this pilot.';
