import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { refreshAccessTokenOrClear } from '@/lib/googleDrive';
import { upsertCalendarEvent, type CalendarEntry } from '@/lib/googleCalendar';
import type { DayPeriod } from '@/lib/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ScheduleEntry = { period: DayPeriod; times: string[] };
type ScheduleMap = Record<string, ScheduleEntry>;

const PERIOD_LABEL: Record<DayPeriod, string> = {
  full: 'Ganztag', half_am: 'Halbtag Vormittag', half_pm: 'Halbtag Nachmittag',
};

/**
 * POST { month?: "YYYY-MM" }
 *
 * Pushes the pilot's Skywings-scheduled days into their Google Calendar.
 * Defaults to all scheduled days; if `month` is given, only that month.
 * Idempotent — re-running updates existing events instead of duplicating.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string };
  const monthFilter = /^\d{4}-\d{2}$/.test(body.month ?? '') ? body.month! : null;

  const { data: pilot, error } = await sb
    .from('pilots')
    .select('google_refresh_token, einsatzplan_schedule')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 400 });
  }

  const schedule = (pilot.einsatzplan_schedule as ScheduleMap | null) ?? {};
  const dates = Object.keys(schedule)
    .filter(d => !monthFilter || d.startsWith(monthFilter))
    .sort();
  if (dates.length === 0) {
    return NextResponse.json({ error: 'no_scheduled_days', detail: 'No schedule for this period.' }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessTokenOrClear(sb, user.id, pilot.google_refresh_token);
    let created = 0, updated = 0;

    for (const date of dates) {
      const entry = schedule[date];
      if (!entry?.times?.length) continue;
      const startTime = entry.times[0];
      const endTime = entry.times[entry.times.length - 1];
      const calEntry: CalendarEntry = {
        date,
        summary: `Skywings — ${PERIOD_LABEL[entry.period]}`,
        startTime,
        endTime,
        description: `Einsatz ${PERIOD_LABEL[entry.period]} · ${startTime}–${endTime}\nAus dem Skywings-Einsatzplan (TandemLog).`,
      };
      const r = await upsertCalendarEvent(calEntry, tokens.access_token);
      if (r.action === 'created') created++; else updated++;
    }

    return NextResponse.json({ ok: true, created, updated, total: created + updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
