import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateMonthlyBackupXlsx, generateRangeBackupXlsx } from '@/lib/backupXlsx';
import type { FlightRow } from '@/lib/flights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/backup/xlsx
 *
 * Supports three modes:
 *  - ?month=YYYY-MM-01       → single-month workbook (one sheet)
 *  - ?months=YYYY-MM,YYYY-MM → multi-month workbook (one sheet per month)
 *  - ?year=YYYY              → full-year workbook (12 sheets Jan..Dec)
 *
 * Same hand-layout the Drive backup uses; sheets are named "Jan 2026" etc.
 */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const monthParam = url.searchParams.get('month');
  const monthsParam = url.searchParams.get('months');
  const yearParam = url.searchParams.get('year');

  // Resolve target month list.
  let months: string[] = [];
  if (monthParam) {
    if (!/^\d{4}-\d{2}-01$/.test(monthParam)) {
      return NextResponse.json({ error: 'invalid month (YYYY-MM-01)' }, { status: 400 });
    }
    months = [monthParam];
  } else if (monthsParam) {
    months = monthsParam.split(',').map(s => s.trim()).filter(Boolean).map(toMonthFirst);
    if (months.length === 0 || months.some(m => !/^\d{4}-\d{2}-01$/.test(m))) {
      return NextResponse.json({ error: 'invalid months list (use YYYY-MM,YYYY-MM,…)' }, { status: 400 });
    }
    if (months.length > 60) {
      return NextResponse.json({ error: 'too many months (max 60)' }, { status: 400 });
    }
  } else if (yearParam) {
    if (!/^\d{4}$/.test(yearParam)) {
      return NextResponse.json({ error: 'invalid year (YYYY)' }, { status: 400 });
    }
    const y = Number(yearParam);
    months = Array.from({ length: 12 }, (_, i) =>
      `${y}-${String(i + 1).padStart(2, '0')}-01`,
    );
  } else {
    return NextResponse.json({ error: 'provide ?month=, ?months=, or ?year=' }, { status: 400 });
  }

  const sortedMonths = [...months].sort();
  const rangeStart = sortedMonths[0];
  const lastMonthFirst = sortedMonths[sortedMonths.length - 1];
  const [y, m] = lastMonthFirst.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const rangeEnd = `${lastMonthFirst.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;

  const [{ data: pilot }, { data: flightRows, error }] = await Promise.all([
    sb.from('pilots').select('full_name').eq('id', user.id).maybeSingle(),
    sb.from('flights').select('*')
      .gte('flight_date', rangeStart).lte('flight_date', rangeEnd)
      .order('flight_date').order('trip_time'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allFlights = (flightRows ?? []) as FlightRow[];

  // Bucket flights by month for each requested sheet (months with zero flights
  // still get a sheet, but we drop empty months if it's a multi-month export
  // — empty single-month export stays the existing 404 to preserve the UI
  // message).
  const monthSet = new Set(sortedMonths);
  const byMonth = new Map<string, FlightRow[]>();
  for (const m of sortedMonths) byMonth.set(m, []);
  for (const f of allFlights) {
    const key = `${f.flight_date.slice(0, 7)}-01`;
    if (monthSet.has(key)) byMonth.get(key)!.push(f);
  }

  const pilotName = pilot?.full_name ?? '';

  // Single-month path keeps the original single-sheet workbook + 404 on empty.
  if (sortedMonths.length === 1) {
    const list = byMonth.get(sortedMonths[0]) ?? [];
    if (list.length === 0) {
      return NextResponse.json({ error: 'no flights in this month' }, { status: 404 });
    }
    const buf = await generateMonthlyBackupXlsx({
      flights: list,
      monthFirst: sortedMonths[0],
      pilotName,
    });
    const filename = `tandemlog-${sortedMonths[0].slice(0, 7)}.xlsx`;
    return xlsxResponse(buf, filename);
  }

  // Multi-month / year: drop months without flights so we never emit an empty
  // sheet. If nothing at all → 404.
  const sheets = sortedMonths
    .map(m => ({ monthFirst: m, flights: byMonth.get(m) ?? [] }))
    .filter(s => s.flights.length > 0);
  if (sheets.length === 0) {
    return NextResponse.json({ error: 'no flights in the selected range' }, { status: 404 });
  }
  const buf = await generateRangeBackupXlsx({ pilotName, months: sheets });

  const filename = yearParam
    ? `tandemlog-${yearParam}.xlsx`
    : `tandemlog-${sortedMonths[0].slice(0, 7)}_to_${sortedMonths[sortedMonths.length - 1].slice(0, 7)}.xlsx`;
  return xlsxResponse(buf, filename);
}

function toMonthFirst(s: string): string {
  // Accept "YYYY-MM" or "YYYY-MM-01" — normalize to YYYY-MM-01.
  return /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
}

function xlsxResponse(buf: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
