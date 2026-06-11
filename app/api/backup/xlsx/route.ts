import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateMonthlyBackupXlsx } from '@/lib/backupXlsx';
import type { FlightRow } from '@/lib/flights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download the month's flights as the hand-layout Excel — same file the
 * Drive backup produces, but as a direct download (no Drive needed).
 * GET /api/backup/xlsx?month=YYYY-MM-01
 */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const month = new URL(req.url).searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'invalid month (expected YYYY-MM-01)' }, { status: 400 });
  }

  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthLast = `${month.slice(0, 8)}${String(last).padStart(2, '0')}`;

  const [{ data: pilot }, { data: flightRows, error }] = await Promise.all([
    sb.from('pilots').select('full_name').eq('id', user.id).maybeSingle(),
    sb.from('flights').select('*')
      .gte('flight_date', month).lte('flight_date', monthLast)
      .order('flight_date').order('trip_time'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flights = (flightRows ?? []) as FlightRow[];
  if (flights.length === 0) {
    return NextResponse.json({ error: 'no flights in this month' }, { status: 404 });
  }

  const buf = await generateMonthlyBackupXlsx({
    flights,
    monthFirst: month,
    pilotName: pilot?.full_name ?? '',
  });

  const filename = `tandemlog-${month.slice(0, 7)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
