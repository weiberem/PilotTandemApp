-- Demo-Sandbox: jeder Besucher der /demo öffnet bekommt einen frischen
-- Pilot-Tenant mit Seed-Daten. Nach demo_expires_at wird der User samt
-- aller Daten via daily Cron gelöscht (Cascade über auth.users-FK).

alter table pilots
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_expires_at timestamptz;

create index if not exists pilots_demo_expires_idx
  on pilots (demo_expires_at) where is_demo = true;
