-- Pilot can opt in to automatic invoice sending: when the monthly cron
-- finds all flight days of the previous month verified, it sends the
-- invoice without manual confirmation.
alter table pilots
  add column if not exists auto_send_invoice boolean not null default false;
