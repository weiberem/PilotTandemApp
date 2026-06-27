-- Global app settings (singleton). Holds the office-controlled current season,
-- which overrides the automatic date-based summer/winter switch for pilots on
-- 'auto'. Readable by all authenticated users; written only via service role
-- from the admin board.
create table if not exists app_settings (
  id int primary key default 1,
  current_season text not null default 'auto' check (current_season in ('auto', 'summer', 'winter')),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;
drop policy if exists "app_settings read" on app_settings;
create policy "app_settings read" on app_settings for select to authenticated using (true);
