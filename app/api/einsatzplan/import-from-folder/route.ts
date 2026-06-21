import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchExcelBytes, listExcelFilesInFolder, refreshAccessTokenOrClear, type DriveFileEntry,
} from '@/lib/googleDrive';
import { parseEinsatzplan, parseFullPlan } from '@/lib/einsatzplanParser';
import {
  type EinsatzplanImports, type MonthlyImport, monthKey, detectMonthFromName,
} from '@/lib/einsatzplanImports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PARSE_PROBES = 8; // cap downloads for files whose name doesn't reveal the month

/**
 * POST { month: "YYYY-MM" }
 *
 * Finds the matching schedule file inside the pilot's linked Schedule folder
 * and imports it into that month's slot — no manual link pasting. The right
 * file is chosen by month: from the file name when possible, otherwise by
 * parsing (capped). Stores into pilots.einsatzplan_imports[month] and mirrors
 * the legacy "active" columns when it's the current month.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string };
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'invalid_month', detail: 'month must be "YYYY-MM".' }, { status: 400 });
  }
  const month = body.month;

  const { data: pilot, error: pErr } = await sb
    .from('pilots')
    .select('full_name, google_refresh_token, season_override, einsatzplan_imports, einsatzplan_folder_id')
    .eq('id', user.id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected', detail: 'Connect Google Drive first.' }, { status: 400 });
  }
  if (!pilot.einsatzplan_folder_id) {
    return NextResponse.json({ error: 'no_folder', detail: 'No Schedule folder configured in Settings.' }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessTokenOrClear(sb, user.id, pilot.google_refresh_token);
    const files = await listExcelFilesInFolder(pilot.einsatzplan_folder_id, tokens.access_token);
    if (files.length === 0) {
      return NextResponse.json({ error: 'no_files_in_folder', detail: 'The Schedule folder has no Excel/Sheets files.' }, { status: 400 });
    }

    const opts = { pilotName: pilot.full_name ?? '', seasonOverride: pilot.season_override ?? null };

    // Pick the file for `month`. Files are newest-first, so the first match
    // wins (handles re-uploaded/updated plans). Use the name to skip obvious
    // non-matches without downloading; parse only when the name is unrevealing.
    let chosen: { file: DriveFileEntry; buf: ArrayBuffer } | null = null;
    let probes = 0;
    for (const f of files) {
      const nameMonth = detectMonthFromName(f.name);
      if (nameMonth && nameMonth !== month) continue;           // definitely another month
      if (nameMonth == null) {
        if (probes >= MAX_PARSE_PROBES) continue;
        probes++;
      }
      const buf = await fetchExcelBytes(f, tokens.access_token);
      const probe = await parseEinsatzplan(buf, opts).catch(() => ({} as Record<string, unknown>));
      let parsedMonth = Object.keys(probe)[0]?.slice(0, 7) ?? null;
      if (!parsedMonth) {
        // Pilot may not be on this plan — fall back to the whole-plan month.
        try { parsedMonth = (await parseFullPlan(buf)).month?.slice(0, 7) ?? null; } catch { /* ignore */ }
      }
      if (parsedMonth === month) { chosen = { file: f, buf }; break; }
    }

    if (!chosen) {
      return NextResponse.json({
        error: 'no_file_for_month',
        detail: `No file for ${month} found in the folder. Skywings may not have uploaded it yet — or import the link manually.`,
      }, { status: 404 });
    }

    const schedule = await parseEinsatzplan(chosen.buf, opts);
    let fullPlan: Awaited<ReturnType<typeof parseFullPlan>> | null = null;
    try { fullPlan = await parseFullPlan(chosen.buf); }
    catch (e) { console.warn('parseFullPlan failed:', (e as Error).message); }

    const now = new Date().toISOString();
    const entry: MonthlyImport = {
      drive_link: chosen.file.id,
      file_id: chosen.file.id,
      file_name: chosen.file.name ?? null,
      schedule,
      full_plan: fullPlan,
      last_synced_at: now,
      archived: false,
    };

    const imports: EinsatzplanImports = (pilot.einsatzplan_imports as EinsatzplanImports | null) ?? {};
    imports[month] = entry;

    const updatePayload: Record<string, unknown> = {
      einsatzplan_imports: imports,
      einsatzplan_synced_at: now,
      einsatzplan_last_file_id: chosen.file.id,
      einsatzplan_last_file_name: chosen.file.name ?? null,
    };
    if (month === monthKey(new Date())) {
      updatePayload.einsatzplan_schedule = schedule;
      updatePayload.einsatzplan_full_plan = fullPlan;
    }

    const { error: upErr } = await sb.from('pilots').update(updatePayload).eq('id', user.id);
    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      month,
      days: Object.keys(schedule).length,
      file_name: chosen.file.name ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
