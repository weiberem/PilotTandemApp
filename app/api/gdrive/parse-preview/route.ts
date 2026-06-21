import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  extractDriveFileId, fetchExcelBytes, getFileMetadata, refreshAccessTokenOrClear,
} from '@/lib/googleDrive';
import { parseEinsatzplan } from '@/lib/einsatzplanParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { url_or_id: string }
 *
 * Parses the linked Drive file WITHOUT saving — the UI shows what was
 * extracted so the pilot can correct it before committing.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { url_or_id?: string };
  const fileId = extractDriveFileId(body.url_or_id ?? '');
  if (!fileId) return NextResponse.json({ error: 'invalid_url' }, { status: 400 });

  const { data: pilot } = await sb
    .from('pilots')
    .select('full_name, google_refresh_token, season_override')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessTokenOrClear(sb, user.id, pilot.google_refresh_token);
    const meta = await getFileMetadata(fileId, tokens.access_token);
    const buf = await fetchExcelBytes(meta, tokens.access_token);
    const schedule = await parseEinsatzplan(buf, {
      pilotName: pilot.full_name ?? '',
      seasonOverride: pilot.season_override ?? null,
    });
    return NextResponse.json({
      ok: true,
      file_id: meta.id,
      file_name: meta.name,
      modified_time: meta.modifiedTime,
      schedule,
      days: Object.keys(schedule).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
