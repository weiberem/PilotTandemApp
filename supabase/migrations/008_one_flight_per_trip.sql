-- Each pilot may log at most one flight per (date, trip_time).
-- A given Skywings departure slot has exactly one tandem pilot, so a
-- duplicate entry on the same time is always a data-entry mistake.
-- Pre-existing duplicates (none expected) would block this migration;
-- if any exist they need to be cleaned up first.

alter table flights
  add constraint flights_pilot_date_time_unique
  unique (pilot_id, flight_date, trip_time);
