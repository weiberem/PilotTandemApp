-- TandemLog initial schema
-- Multi-tenant: every data row is scoped by pilot_id = auth.uid()
-- Admins have a separate `admins` table with NO read access to pilot data.

set check_function_bodies = off;

-- ============================================================
-- pilots: profile data, extends auth.users
-- ============================================================
create table if not exists pilots (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  iban text,
  vat_number text,
  primary_company_name text default 'Skywings Adventures GmbH',
  primary_company_address text default 'Brandstrasse 38, 3852 Ringgenberg',
  office_email text,
  personal_email text,
  invoice_cc_email text,
  google_drive_folder_id text,
  einsatzplan_file_id text,
  google_refresh_token text,            -- encrypted at rest by Supabase
  einsatzplan_schedule jsonb,           -- cached parsed schedule
  einsatzplan_synced_at timestamptz,
  flight_rate_chf numeric not null default 105,
  photo_prepaid_rate_chf numeric not null default 40,
  thermal_rate_chf numeric not null default 50,
  no_show_rate_chf numeric not null default 32,
  vat_rate numeric not null default 0.081,
  season_override text check (season_override in ('summer','winter')),
  invoice_counter_year int,             -- current counter year (e.g. 2025)
  invoice_counter int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- flights
-- ============================================================
create table if not exists flights (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilots(id) on delete cascade,
  flight_date date not null,
  trip_time text not null,                          -- "HH:MM" — free text for non-Skywings
  company text not null default 'Skywings',
  photo_status text not null default 'none'
    check (photo_status in ('none','PP','CC','C')),
  is_no_show boolean not null default false,
  is_double_airtime boolean not null default false,
  tip_chf numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a no-show cannot also have a photo or thermal
  check (not is_no_show or (photo_status = 'none' and is_double_airtime = false))
);

create index if not exists flights_pilot_date_idx on flights(pilot_id, flight_date desc);
create index if not exists flights_pilot_company_idx on flights(pilot_id, company);

-- ============================================================
-- availability_submissions
-- ============================================================
create table if not exists availability_submissions (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilots(id) on delete cascade,
  month date not null,                              -- first of month
  submitted_at timestamptz,
  email_sent boolean not null default false,
  days jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id, month)
);

-- ============================================================
-- invoices
-- ============================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilots(id) on delete cascade,
  month date not null,                              -- first of invoiced month
  company text not null default 'Skywings',
  invoice_number text,                              -- "YYYY-NNN"
  status text not null default 'draft'
    check (status in ('draft','sent')),
  total_chf numeric,
  flights_count int,
  pp_count int,
  thermal_count int,
  no_show_count int,
  pdf_url text,
  xlsx_url text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id, month, company)
);

create index if not exists invoices_pilot_month_idx on invoices(pilot_id, month desc);

-- ============================================================
-- admins (separate from pilots; no data access)
-- ============================================================
create table if not exists admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pilots_set_updated on pilots;
create trigger pilots_set_updated before update on pilots
  for each row execute function set_updated_at();

drop trigger if exists flights_set_updated on flights;
create trigger flights_set_updated before update on flights
  for each row execute function set_updated_at();

drop trigger if exists availability_set_updated on availability_submissions;
create trigger availability_set_updated before update on availability_submissions
  for each row execute function set_updated_at();

drop trigger if exists invoices_set_updated on invoices;
create trigger invoices_set_updated before update on invoices
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table pilots enable row level security;
alter table flights enable row level security;
alter table availability_submissions enable row level security;
alter table invoices enable row level security;
alter table admins enable row level security;

-- pilots: each pilot can only see + update their own row.
drop policy if exists "pilots select own" on pilots;
create policy "pilots select own" on pilots for select
  using (id = auth.uid());

drop policy if exists "pilots insert own" on pilots;
create policy "pilots insert own" on pilots for insert
  with check (id = auth.uid());

drop policy if exists "pilots update own" on pilots;
create policy "pilots update own" on pilots for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- flights: full CRUD on own rows.
drop policy if exists "flights all own" on flights;
create policy "flights all own" on flights for all
  using (pilot_id = auth.uid())
  with check (pilot_id = auth.uid());

-- availability_submissions: full CRUD on own rows.
drop policy if exists "availability all own" on availability_submissions;
create policy "availability all own" on availability_submissions for all
  using (pilot_id = auth.uid())
  with check (pilot_id = auth.uid());

-- invoices: full CRUD on own rows.
drop policy if exists "invoices all own" on invoices;
create policy "invoices all own" on invoices for all
  using (pilot_id = auth.uid())
  with check (pilot_id = auth.uid());

-- admins: only admins can read the admins table; no client writes.
drop policy if exists "admins read self" on admins;
create policy "admins read self" on admins for select
  using (id = auth.uid());

-- ============================================================
-- Helper: is current user an admin?
-- ============================================================
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists(select 1 from admins where id = auth.uid());
$$;
grant execute on function is_admin() to authenticated;

-- ============================================================
-- Auto-create pilot row on signup (full_name from metadata)
-- ============================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into pilots (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
