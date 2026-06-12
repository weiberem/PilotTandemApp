import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { ChangeRequestMap } from '@/lib/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Swap requests directed at the calling pilot for a given month. Uses the
 * service client to read across pilots, but only ever returns entries whose
 * resolved swap_with_pilot_id is the caller — no broad swap board, so a pilot
 * can't see who else wants days off.
 */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const month = req.nextUrl.searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'invalid month' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: rows } = await svc
    .from('availability_submissions')
    .select('pilot_id, change_requests')
    .eq('month', month);

  const incoming: { date: string; fromPilotId: string; note?: string }[] = [];
  for (const row of rows ?? []) {
    if (row.pilot_id === user.id) continue;
    const map = (row.change_requests as ChangeRequestMap | null) ?? {};
    for (const [date, cr] of Object.entries(map)) {
      if (cr.reason === 'swap' && cr.status === 'pending' && cr.swap_with_pilot_id === user.id) {
        incoming.push({ date, fromPilotId: row.pilot_id as string, note: cr.note });
      }
    }
  }

  if (incoming.length === 0) return NextResponse.json({ requests: [] });

  const ids = [...new Set(incoming.map(i => i.fromPilotId))];
  const { data: pilots } = await svc.from('pilots').select('id, full_name').in('id', ids);
  const nameById = new Map((pilots ?? []).map(p => [p.id as string, (p.full_name as string) ?? '']));

  return NextResponse.json({
    requests: incoming
      .map(i => ({ ...i, fromPilotName: nameById.get(i.fromPilotId) ?? 'A colleague' }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}
