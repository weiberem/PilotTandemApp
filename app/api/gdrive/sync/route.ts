import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  downloadDriveFile, fetchExcelBytes, listExcelFilesInFolder, refreshAccessToken,
  type DriveFileEntry,
} from '@/lib/googleDrive';
import { parseEinsatzplan, parseFullPlan } from '@/lib/einsatzplanParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: pilot, error: pilotErr } = await supabase
    .from('pilots')
    .select('full_name, google_refresh_token, einsatzplan_file_id, einsatzplan_folder_id, season_override')
    .eq('id', user.id)
    .maybeSingle();
  if (pilotErr) return NextResponse.json({ error: pilotErr.message }, { status: 500 });
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 400 });
  }
  if (!pilot.einsatzplan_folder_id && !pilot.einsatzplan_file_id) {
    return NextResponse.json({ error: 'no_source_configured' }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessToken(pilot.google_refresh_token);

    // Resolve the file to download.
    // Priority: folder → newest file inside; fallback: pinned file id.
    let buf: ArrayBuffer;
    let usedFileId: string;
    let usedFileName: string | null = null;
    if (pilot.einsatzplan_folder_id) {
      const files = await listExcelFilesInFolder(pilot.einsatzplan_folder_id, tokens.access_token);
      if (files.length === 0) {
        return NextResponse.json({
          error: 'no_files_in_folder',
          detail: 'Im Ordner wurden keine Excel-/Sheets-Dateien gefunden.',
        }, { status: 400 });
      }
      const newest: DriveFileEntry = files[0]; // listExcelFilesInFolder sorts desc
      buf = await fetchExcelBytes(newest, tokens.access_token);
      usedFileId = newest.id;
      usedFileName = newest.name;
    } else {
      buf = await downloadDriveFile(pilot.einsatzplan_file_id!, tokens.access_token);
      usedFileId = pilot.einsatzplan_file_id!;
    }

    const schedule = await parseEinsatzplan(buf, {
      pilotName: pilot.full_name ?? '',
      seasonOverride: pilot.season_override ?? null,
    });
    // Parse the WHOLE plan (best-effort). A failure here must not break the
    // pilot-only sync — that's the canonical /log data source.
    let fullPlan: Awaited<ReturnType<typeof parseFullPlan>> | null = null;
    try {
      fullPlan = await parseFullPlan(buf);
    } catch (e) {
      console.warn('parseFullPlan failed (continuing):', (e as Error).message);
    }
    const syncedAt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('pilots')
      .update({
        einsatzplan_schedule: schedule,
        einsatzplan_full_plan: fullPlan,
        einsatzplan_synced_at: syncedAt,
        einsatzplan_last_file_id: usedFileId,
        einsatzplan_last_file_name: usedFileName,
      })
      .eq('id', user.id);
    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      synced_at: syncedAt,
      days: Object.keys(schedule).length,
      file_id: usedFileId,
      file_name: usedFileName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
