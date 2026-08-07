-- Pilot type: 'skywings' (full feature set: availability planning, schedule
-- import, Google Drive, daysheet, office invoicing) or 'independent' (light:
-- log flights, statistics, invoices, settings — no Skywings-only planning).
-- Defaults to 'skywings' so every existing pilot is unaffected.
alter table pilots
  add column if not exists pilot_type text not null default 'skywings'
  check (pilot_type in ('skywings', 'independent'));
