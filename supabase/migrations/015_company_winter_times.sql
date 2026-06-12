-- Per-company seasonal trip times: the existing trip_times column holds
-- the summer (or "single-season") schedule; trip_times_winter is optional
-- for companies whose winter schedule differs (matches the pilot's
-- season_override / auto-detected season). If trip_times_winter is NULL,
-- trip_times applies year-round.
alter table pilot_companies
  add column if not exists trip_times_winter text[];
