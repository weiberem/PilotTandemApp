import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Export the signed-in pilot's full data as a JSON file. The pilot can save
 * it locally as insurance — re-import via POST /api/backup/import.
 */
export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [pilotRes, flightsRes, versRes, invoicesRes] = await Promise.all([
    sb.from('pilots').select('*').eq('id', user.id).maybeSingle(),
    sb.from('flights').select('*').eq('pilot_id', user.id).order('flight_date').order('trip_time'),
    sb.from('day_verifications').select('flight_date, verified_at').eq('pilot_id', user.id),
    sb.from('invoices').select('*').eq('pilot_id', user.id),
  ]);

  if (pilotRes.error) return NextResponse.json({ error: pilotRes.error.message }, { status: 500 });

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    pilot: stripPilot(pilotRes.data),
    flights: (flightsRes.data ?? []).map(stripFlight),
    day_verifications: versRes.data ?? [],
    invoices: invoicesRes.data ?? [],
  };

  const filename = `tandemlog-backup-${user.email?.split('@')[0] ?? user.id}-${
    new Date().toISOString().slice(0, 10)
  }.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

function stripPilot(p: Record<string, unknown> | null) {
  if (!p) return null;
  // Drop id + system flags; the import will assign the current user's id.
  const { id, is_admin, is_demo, demo_expires_at, created_at, updated_at, ...rest } = p;
  void id; void is_admin; void is_demo; void demo_expires_at; void created_at; void updated_at;
  return rest;
}

function stripFlight(f: Record<string, unknown>) {
  const { id, pilot_id, created_at, updated_at, ...rest } = f;
  void id; void pilot_id; void created_at; void updated_at;
  return rest;
}
