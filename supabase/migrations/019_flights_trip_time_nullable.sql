-- Daysheet counts-capture creates flights from per-pilot totals that have no
-- departure times. Rather than inventing placeholder clock times, store such
-- flights without a time. The (pilot, date, trip_time) unique constraint keeps
-- working: NULL trip_times are distinct, so several timeless flights per day
-- are allowed. Times can be filled in later (manually, or from a SumUp match).
alter table flights
  alter column trip_time drop not null;
