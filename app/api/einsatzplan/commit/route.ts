import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const entrySchema = z.object({
  period: z.enum(['full', 'half_am', 'half_pm']),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(20),
});

const bodySchema = z.object({
  schedule: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), entrySchema),
  file_id: z.string().optional(),
  file_name: z.string().optional(),
  mode: z.enum(['replace', 'merge']).default('merge'),
});

/**
 * Saves a (possibly user-edited) parsed schedule into pilots.einsatzplan_schedule.
 * Default mode is 'merge' so importing a new month doesn't wipe other months.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid' }, { status: 400 });

  let next: typeof parsed.data.schedule = parsed.data.schedule;
  if (parsed.data.mode === 'merge') {
    const { data } = await sb.from('pilots').select('einsatzplan_schedule').eq('id', user.id).maybeSingle();
    const existing = (data?.einsatzplan_schedule ?? {}) as typeof parsed.data.schedule;
    next = { ...existing, ...parsed.data.schedule };
  }

  const { error } = await sb.from('pilots').update({
    einsatzplan_schedule: next,
    einsatzplan_synced_at: new Date().toISOString(),
    einsatzplan_last_file_id: parsed.data.file_id ?? null,
    einsatzplan_last_file_name: parsed.data.file_name ?? null,
  }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, days: Object.keys(next).length });
}
