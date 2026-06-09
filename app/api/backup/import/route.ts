import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Backup = {
  version?: number;
  pilot?: Record<string, unknown> | null;
  flights?: Array<Record<string, unknown>>;
  day_verifications?: Array<{ flight_date: string; verified_at?: string }>;
  invoices?: Array<Record<string, unknown>>;
};

/**
 * Restore from a backup JSON. Insert-if-missing semantics — never deletes
 * existing rows. Flights are de-duped on (flight_date, trip_time, company);
 * day verifications on (flight_date); invoices on (month, company).
 *
 * Pilot profile fields are merged: only the columns present in the backup
 * are written, and only if the current row has them empty (we don't
 * overwrite anything the pilot already filled in).
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Backup;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const stats = { pilot_updated: false, flights_inserted: 0, verifications_inserted: 0, invoices_inserted: 0, skipped_duplicates: 0 };

  // Merge pilot profile (don't overwrite already-filled fields).
  if (body.pilot && typeof body.pilot === 'object') {
    const { data: current } = await sb.from('pilots').select('*').eq('id', user.id).maybeSingle();
    if (current) {
      const merged: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body.pilot)) {
        if (v == null || v === '') continue;
        const cur = (current as Record<string, unknown>)[k];
        if (cur == null || cur === '') merged[k] = v;
      }
      if (Object.keys(merged).length > 0) {
        const { error } = await sb.from('pilots').update(merged).eq('id', user.id);
        if (!error) stats.pilot_updated = true;
      }
    }
  }

  // Flights — de-dupe against existing by (date, time, company).
  if (Array.isArray(body.flights) && body.flights.length > 0) {
    const dates = [...new Set(body.flights.map(f => String(f.flight_date)))];
    const { data: existing } = await sb
      .from('flights')
      .select('flight_date, trip_time, company')
      .eq('pilot_id', user.id)
      .in('flight_date', dates);
    const seen = new Set((existing ?? []).map(r => `${r.flight_date}|${r.trip_time}|${r.company}`));

    const toInsert = body.flights
      .filter(f => {
        const key = `${f.flight_date}|${f.trip_time}|${f.company ?? 'Skywings'}`;
        if (seen.has(key)) { stats.skipped_duplicates++; return false; }
        seen.add(key);
        return true;
      })
      .map(f => ({
        pilot_id: user.id,
        flight_date: f.flight_date,
        trip_time: f.trip_time,
        company: f.company ?? 'Skywings',
        photo_status: f.photo_status ?? 'none',
        is_no_show: f.is_no_show ?? false,
        is_double_airtime: f.is_double_airtime ?? false,
        tip_chf: f.tip_chf ?? 0,
        notes: f.notes ?? null,
      }));

    if (toInsert.length > 0) {
      const { error } = await sb.from('flights').insert(toInsert);
      if (error) return NextResponse.json({ error: `flights: ${error.message}`, stats }, { status: 500 });
      stats.flights_inserted = toInsert.length;
    }
  }

  // Day verifications — de-dupe on (flight_date).
  if (Array.isArray(body.day_verifications) && body.day_verifications.length > 0) {
    const dates = body.day_verifications.map(v => v.flight_date);
    const { data: existing } = await sb
      .from('day_verifications')
      .select('flight_date')
      .eq('pilot_id', user.id)
      .in('flight_date', dates);
    const seen = new Set((existing ?? []).map(r => r.flight_date as string));
    const toInsert = body.day_verifications
      .filter(v => !seen.has(v.flight_date))
      .map(v => ({ pilot_id: user.id, flight_date: v.flight_date }));
    if (toInsert.length > 0) {
      const { error } = await sb.from('day_verifications').insert(toInsert);
      if (!error) stats.verifications_inserted = toInsert.length;
    }
  }

  // Invoices — de-dupe on (month, company).
  if (Array.isArray(body.invoices) && body.invoices.length > 0) {
    const { data: existing } = await sb.from('invoices')
      .select('month, company')
      .eq('pilot_id', user.id);
    const seen = new Set((existing ?? []).map(r => `${r.month}|${r.company}`));
    const toInsert = body.invoices
      .filter(inv => !seen.has(`${inv.month}|${inv.company}`))
      .map(inv => {
        const { id, pilot_id, created_at, updated_at, ...rest } = inv;
        void id; void pilot_id; void created_at; void updated_at;
        return { ...rest, pilot_id: user.id };
      });
    if (toInsert.length > 0) {
      const { error } = await sb.from('invoices').insert(toInsert);
      if (!error) stats.invoices_inserted = toInsert.length;
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
