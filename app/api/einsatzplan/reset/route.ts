import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { refreshAccessToken } from '@/lib/googleDrive';
import { deleteMonthCalendarEvents } from '@/lib/googleCalendar';
import { monthKey as toMonthKey, type EinsatzplanImports } from '@/lib/einsatzplanImports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { month: "YYYY-MM", clear_calendar?: boolean }
 *
 * Clears the per-month import slot for the calling pilot. If `clear_calendar`
 * is true, also deletes every TandemLog-tagged Google Calendar event for that
 * month. Mirrors back into the legacy active columns when the cleared month
 * was the current one.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string; clear_calendar?: boolean };
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'invalid_month' }, { status: 400 });
  }
  const month = body.month;
  const clearCal = !!body.clear_calendar;

  const { data: pilot, error: pErr } = await sb
    .from('pilots')
    .select('google_refresh_token, einsatzplan_imports')
    .eq('id', user.id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!pilot) return NextResponse.json({ error: 'pilot_not_found' }, { status: 404 });

  // Drop the slot.
  const imports: EinsatzplanImports = (pilot.einsatzplan_imports as EinsatzplanImports | null) ?? {};
  delete imports[month];

  const update: Record<string, unknown> = { einsatzplan_imports: imports };
  // If it was the active month, clear the legacy cache too.
  if (month === toMonthKey(new Date())) {
    update.einsatzplan_schedule = null;
    update.einsatzplan_full_plan = null;
  }
  const { error: upErr } = await sb.from('pilots').update(update).eq('id', user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  let calendarDeleted = 0;
  if (clearCal) {
    if (!pilot.google_refresh_token) {
      return NextResponse.json({
        ok: true, month, calendar_deleted: 0,
        warning: 'calendar_not_connected',
      });
    }
    try {
      const tokens = await refreshAccessToken(pilot.google_refresh_token);
      calendarDeleted = await deleteMonthCalendarEvents(month, tokens.access_token);
    } catch (e) {
      return NextResponse.json({
        ok: true, month, calendar_deleted: 0,
        warning: `calendar_cleanup_failed: ${(e as Error).message}`,
      });
    }
  }

  return NextResponse.json({ ok: true, month, calendar_deleted: calendarDeleted });
}
