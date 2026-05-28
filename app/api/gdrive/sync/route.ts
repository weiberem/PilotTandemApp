import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { downloadDriveFile, refreshAccessToken } from '@/lib/googleDrive';
import { parseEinsatzplan } from '@/lib/einsatzplanParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: pilot, error: pilotErr } = await supabase
    .from('pilots')
    .select('full_name, google_refresh_token, einsatzplan_file_id, season_override')
    .eq('id', user.id)
    .maybeSingle();
  if (pilotErr) return NextResponse.json({ error: pilotErr.message }, { status: 500 });
  if (!pilot?.google_refresh_token) return NextResponse.json({ error: 'not_connected' }, { status: 400 });
  if (!pilot.einsatzplan_file_id) return NextResponse.json({ error: 'no_file_id' }, { status: 400 });

  try {
    const tokens = await refreshAccessToken(pilot.google_refresh_token);
    const buf = await downloadDriveFile(pilot.einsatzplan_file_id, tokens.access_token);
    const schedule = await parseEinsatzplan(buf, {
      pilotName: pilot.full_name ?? '',
      seasonOverride: pilot.season_override ?? null,
    });
    const syncedAt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('pilots')
      .update({ einsatzplan_schedule: schedule, einsatzplan_synced_at: syncedAt })
      .eq('id', user.id);
    if (updErr) throw updErr;
    return NextResponse.json({
      ok: true,
      synced_at: syncedAt,
      days: Object.keys(schedule).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
