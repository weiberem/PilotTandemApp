-- Default edge-time opt-outs per pilot. When set, every newly marked
-- availability day inherits these flags so a pilot who never flies 07:10
-- doesn't have to manually exclude it on each day. The pilot can still
-- override on a per-day basis via the edge-time toggle strip.
alter table pilots
  add column if not exists default_exclude_7am boolean not null default false,
  add column if not exists default_exclude_5pm boolean not null default false;
