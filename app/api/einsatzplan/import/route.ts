import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  downloadDriveFile, extractDriveFileId, fetchExcelBytes, getFileMetadata,
  refreshAccessToken,
} from '@/lib/googleDrive';
import { parseEinsatzplan, parseFullPlan } from '@/lib/einsatzplanParser';
import {
  type EinsatzplanImports, type MonthlyImport, monthKey, currentAndNextMonthKeys,
} from '@/lib/einsatzplanImports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { month: "YYYY-MM", drive_link: string }
 *
 * Imports the Skywings sheet referenced by `drive_link` into the given month
 * slot. Stores per-month state in pilots.einsatzplan_imports[month]. If the
 * month is the *current* month, also mirrors schedule + full_plan into the
 * legacy pilot.einsatzplan_schedule / einsatzplan_full_plan columns so the
 * /log smart pre-fill and the calendar overlay keep working without any
 * read-path changes.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string; drive_link?: string };
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'invalid_month', detail: 'month must be "YYYY-MM".' }, { status: 400 });
  }
  if (!body.drive_link?.trim()) {
    return NextResponse.json({ error: 'missing_link', detail: 'Drive link required.' }, { status: 400 });
  }
  const fileId = extractDriveFileId(body.drive_link.trim());
  if (!fileId) {
    return NextResponse.json({ error: 'invalid_link', detail: 'Could not extract a Drive file ID from the link.' }, { status: 400 });
  }

  const { data: pilot, error: pErr } = await sb
    .from('pilots')
    .select('full_name, google_refresh_token, season_override, einsatzplan_imports')
    .eq('id', user.id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessToken(pilot.google_refresh_token);

    // Pull the file. Google Sheets need exportSheetAsXlsx; everything else uses alt=media.
    const meta = await getFileMetadata(fileId, tokens.access_token);
    const buf: ArrayBuffer = meta.mimeType === 'application/vnd.google-apps.spreadsheet'
      ? await fetchExcelBytes(meta, tokens.access_token)
      : await downloadDriveFile(fileId, tokens.access_token);

    const schedule = await parseEinsatzplan(buf, {
      pilotName: pilot.full_name ?? '',
      seasonOverride: pilot.season_override ?? null,
    });

    let fullPlan: Awaited<ReturnType<typeof parseFullPlan>> | null = null;
    try { fullPlan = await parseFullPlan(buf); }
    catch (e) { console.warn('parseFullPlan failed:', (e as Error).message); }

    // Verify the parsed month matches the requested slot.
    const firstDate = Object.keys(schedule)[0];
    if (firstDate) {
      const parsedMonth = firstDate.slice(0, 7);
      if (parsedMonth !== body.month) {
        return NextResponse.json({
          error: 'month_mismatch',
          detail: `Schedule is for ${parsedMonth}, but was submitted in slot ${body.month}.`,
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const entry: MonthlyImport = {
      drive_link: body.drive_link.trim(),
      file_id: fileId,
      file_name: meta.name ?? null,
      schedule,
      full_plan: fullPlan,
      last_synced_at: now,
      archived: false,
    };

    const imports: EinsatzplanImports = (pilot.einsatzplan_imports as EinsatzplanImports | null) ?? {};
    imports[body.month] = entry;

    // Mirror into the legacy "active" columns when this is the current month.
    const cur = monthKey(new Date());
    const updatePayload: Record<string, unknown> = {
      einsatzplan_imports: imports,
      einsatzplan_synced_at: now,
      einsatzplan_last_file_id: fileId,
      einsatzplan_last_file_name: meta.name ?? null,
    };
    if (body.month === cur) {
      updatePayload.einsatzplan_schedule = schedule;
      updatePayload.einsatzplan_full_plan = fullPlan;
    }

    const { error: upErr } = await sb.from('pilots').update(updatePayload).eq('id', user.id);
    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      month: body.month,
      days: Object.keys(schedule).length,
      pilots_in_full_plan: fullPlan ? Object.values(fullPlan.days).reduce((s, d) => s + d.pilots.length, 0) : 0,
      file_name: meta.name ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET — returns the import metadata for current + next month (no full payloads).
 * Used by the PlanManager UI to render the two slots.
 */
export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: pilot } = await sb
    .from('pilots')
    .select('einsatzplan_imports, einsatzplan_folder_id')
    .eq('id', user.id)
    .maybeSingle();
  const imports = (pilot?.einsatzplan_imports as EinsatzplanImports | null) ?? {};
  const folderConfigured = !!pilot?.einsatzplan_folder_id;
  const { current, next } = currentAndNextMonthKeys();

  function summarise(key: string) {
    const e = imports[key];
    if (!e) return null;
    return {
      drive_link: e.drive_link,
      file_name: e.file_name,
      last_synced_at: e.last_synced_at,
      archived: e.archived,
      days: Object.keys(e.schedule ?? {}).length,
    };
  }

  return NextResponse.json({
    current_month: current,
    next_month: next,
    current: summarise(current),
    next: summarise(next),
    folder_configured: folderConfigured,
  });
}
