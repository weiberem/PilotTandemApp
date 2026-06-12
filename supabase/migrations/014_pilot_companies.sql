-- Per-pilot extra companies (beyond the primary). Skywings is implicit as
-- the primary on the pilots row; this table stores AlpinAir, Twin, Swiss-
-- Paragliding, etc. so each pilot can register the ones they actually fly
-- for.
--
-- Rates default to the pilot's primary rates if NULL; trip_times is NULL for
-- "manual entry per flight", or an array of HH:MM for a fixed schedule.
create table if not exists pilot_companies (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilots(id) on delete cascade,
  name text not null,
  address text,
  flight_rate_chf numeric,
  photo_prepaid_rate_chf numeric,
  thermal_rate_chf numeric,
  no_show_rate_chf numeric,
  trip_times text[],
  color_hex text not null default '#888888',
  office_email text,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id, name)
);

create index if not exists pilot_companies_pilot_idx
  on pilot_companies (pilot_id) where is_active;

alter table pilot_companies enable row level security;

drop policy if exists "pilot_companies all own" on pilot_companies;
create policy "pilot_companies all own" on pilot_companies for all
  using (pilot_id = auth.uid())
  with check (pilot_id = auth.uid());

drop trigger if exists pilot_companies_set_updated on pilot_companies;
create trigger pilot_companies_set_updated before update on pilot_companies
  for each row execute function set_updated_at();
