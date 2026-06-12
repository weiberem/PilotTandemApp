import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildVatReportXlsx, semesterRange, type VatHalf } from '@/lib/vatReport';
import type { FlightRow, PilotRates } from '@/lib/flights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/backup/vat-report?year=YYYY&half=H1|H2 — on-demand VAT semester Excel. */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const yearStr = url.searchParams.get('year') ?? String(new Date().getUTCFullYear());
  const half = (url.searchParams.get('half') ?? 'H1') as VatHalf;
  if (!/^\d{4}$/.test(yearStr)) {
    return NextResponse.json({ error: 'invalid year' }, { status: 400 });
  }
  if (half !== 'H1' && half !== 'H2') {
    return NextResponse.json({ error: 'invalid half (H1|H2)' }, { status: 400 });
  }
  const year = Number(yearStr);
  const { start, end, label } = semesterRange(year, half);

  const [{ data: pilot }, { data: flightRows, error }] = await Promise.all([
    sb.from('pilots').select('full_name, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf, vat_registered').eq('id', user.id).maybeSingle(),
    sb.from('flights').select('*').gte('flight_date', start).lte('flight_date', end).order('flight_date').order('trip_time'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const flights = (flightRows ?? []) as FlightRow[];
  if (flights.length === 0) {
    return NextResponse.json({ error: `no flights in ${label}` }, { status: 404 });
  }

  const rates: PilotRates = {
    flight_rate_chf: Number(pilot?.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot?.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot?.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot?.no_show_rate_chf ?? 32),
  };

  const { buffer } = await buildVatReportXlsx({
    flights, rates, year, half,
    pilotName: pilot?.full_name ?? '',
    vatRegistered: !!pilot?.vat_registered,
  });

  const filename = `vat-report-${half}-${year}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
