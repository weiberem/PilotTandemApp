import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildAvailabilityIcs, type AvailabilityDay } from '@/lib/availability';
import { effectiveSeason } from '@/lib/tripTimes';
import { getAdminSeason } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/availability/ics?month=YYYY-MM-01
 *
 * Streams the pilot's saved availability for the given month as an .ics file.
 * Returning it from a server URL (with Content-Type: text/calendar) is the
 * iOS-friendly path — tapping the link opens the Calendar "Add Events" prompt
 * directly. Client-side Blob downloads work on desktop but on iOS Safari they
 * land in Files, requiring the user to open and re-share manually.
 */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const month = new URL(req.url).searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'invalid month (YYYY-MM-01)' }, { status: 400 });
  }

  const [pilotRes, subRes] = await Promise.all([
    sb.from('pilots').select('full_name, season_override').eq('id', user.id).maybeSingle(),
    sb.from('availability_submissions').select('days').eq('pilot_id', user.id).eq('month', month).maybeSingle(),
  ]);

  const days = (subRes.data?.days ?? []) as AvailabilityDay[];
  if (days.length === 0) {
    return NextResponse.json({ error: 'no availability entered for this month' }, { status: 404 });
  }

  const adminSeason = await getAdminSeason(sb);
  const season = effectiveSeason(pilotRes.data?.season_override ?? null, adminSeason, new Date(month));
  const ics = buildAvailabilityIcs(days, pilotRes.data?.full_name ?? '', season);
  const filename = `tandem-availability-${month.slice(0, 7)}.ics`;
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
