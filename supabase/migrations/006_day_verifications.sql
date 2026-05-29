-- Per-day verification: pilot bestätigt nach Abgleich mit Skywings-Desk-Sheet,
-- dass die billable-relevanten Zahlen (Flüge, PP, Thermal, No-Show) für diesen
-- Tag stimmen. Monat kann erst fakturiert werden wenn jeder Flugtag verifiziert
-- ist. Eintrag löschen = Verifizierung zurücknehmen.

create table if not exists day_verifications (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilots(id) on delete cascade,
  flight_date date not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pilot_id, flight_date)
);

create index if not exists day_verifications_pilot_month_idx
  on day_verifications (pilot_id, flight_date);

alter table day_verifications enable row level security;

drop policy if exists "verifications all own" on day_verifications;
create policy "verifications all own" on day_verifications for all
  using (pilot_id = auth.uid())
  with check (pilot_id = auth.uid());

-- Once-per-month "ready to bill" notification log.
-- We insert the day-month pair the first time all days are verified; the
-- presence of a row blocks future re-sends if the pilot un-verifies and
-- re-verifies a day inside the same month.
create table if not exists monthly_ready_emails (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilots(id) on delete cascade,
  month date not null,
  sent_at timestamptz not null default now(),
  unique (pilot_id, month)
);

alter table monthly_ready_emails enable row level security;

drop policy if exists "ready emails read own" on monthly_ready_emails;
create policy "ready emails read own" on monthly_ready_emails for select
  using (pilot_id = auth.uid());
-- Writes happen only from server routes using the service-role client.
