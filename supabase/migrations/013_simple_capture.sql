-- Opt-in simplified day capture: pilot uploads a WhatsApp/daysheet screenshot
-- at the end of the day, AI extracts the flights, pilot confirms.
alter table pilots
  add column if not exists simple_capture boolean not null default false;
