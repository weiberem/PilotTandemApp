import { createClient } from './supabase/server';

export type MigrationProbe = {
  id: string;            // "007"
  label: string;         // human description
  file: string;          // path under supabase/migrations
  sql: string;           // exact SQL to copy & run
};

const PROBES: ReadonlyArray<MigrationProbe & {
  test: (sb: ReturnType<typeof createClient>, userId: string) => PromiseLike<{ error: { message: string } | null }>;
}> = [
  {
    id: '004',
    label: 'Full schedule cache (pilots.einsatzplan_full_plan)',
    file: 'supabase/migrations/004_full_plan.sql',
    sql: `alter table pilots add column if not exists einsatzplan_full_plan jsonb;`,
    test: (sb, userId) => sb.from('pilots').select('einsatzplan_full_plan').eq('id', userId).limit(1),
  },
  {
    id: '005',
    label: 'Schedule monthly slots (pilots.einsatzplan_imports)',
    file: 'supabase/migrations/005_einsatzplan_imports.sql',
    sql: `alter table pilots add column if not exists einsatzplan_imports jsonb not null default '{}'::jsonb;`,
    test: (sb, userId) => sb.from('pilots').select('einsatzplan_imports').eq('id', userId).limit(1),
  },
  {
    id: '006',
    label: 'Day verification (day_verifications table)',
    file: 'supabase/migrations/006_day_verifications.sql',
    sql: `-- see supabase/migrations/006_day_verifications.sql\n-- (tables day_verifications + monthly_ready_emails incl. RLS)`,
    test: (sb) => sb.from('day_verifications').select('flight_date').limit(1),
  },
  {
    id: '007',
    label: 'VKPI report toggle (pilots.vkpi_reported_years)',
    file: 'supabase/migrations/007_vkpi_reported_years.sql',
    sql: `alter table pilots add column if not exists vkpi_reported_years jsonb not null default '[]'::jsonb;`,
    test: (sb, userId) => sb.from('pilots').select('vkpi_reported_years').eq('id', userId).limit(1),
  },
  {
    id: '010',
    label: 'Demo sandbox (pilots.is_demo, demo_expires_at)',
    file: 'supabase/migrations/010_demo_account.sql',
    sql:
      `alter table pilots\n` +
      `  add column if not exists is_demo boolean not null default false,\n` +
      `  add column if not exists demo_expires_at timestamptz;\n` +
      `create index if not exists pilots_demo_expires_idx\n` +
      `  on pilots (demo_expires_at) where is_demo = true;`,
    test: (sb, userId) => sb.from('pilots').select('is_demo').eq('id', userId).limit(1),
  },
];

export async function probeMissingMigrations(userId: string): Promise<MigrationProbe[]> {
  const sb = createClient();
  const missing: MigrationProbe[] = [];
  await Promise.all(PROBES.map(async p => {
    try {
      const { error } = await p.test(sb, userId);
      if (error && /does not exist|column|relation/i.test(error.message)) {
        missing.push({ id: p.id, label: p.label, file: p.file, sql: p.sql });
      }
    } catch {
      missing.push({ id: p.id, label: p.label, file: p.file, sql: p.sql });
    }
  }));
  return missing.sort((a, b) => a.id.localeCompare(b.id));
}
