import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { refreshAccessToken } from '@/lib/googleDrive';
import { upsertCalendarEvent, deleteMonthCalendarEvents, type CalendarEntry } from '@/lib/googleCalendar';
import { periodLabel, availabilityDayTimeRange, type AvailabilityDay } from '@/lib/availability';
import { resolveSeason } from '@/lib/tripTimes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { month: "YYYY-MM-01" }
 *
 * Pushes the pilot's saved availability for the month into their Google
 * Calendar as all-day "free"/transparent events — one click, no .ics file.
 * Idempotent: re-running patches the same tagged events instead of doubling.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string };
  const month = body.month ?? '';
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'invalid_month', detail: 'month must be "YYYY-MM-01".' }, { status: 400 });
  }

  const { data: pilot, error } = await sb
    .from('pilots')
    .select('google_refresh_token, season_override')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected', detail: 'Connect Google in Settings first.' }, { status: 400 });
  }

  const { data: sub } = await sb
    .from('availability_submissions')
    .select('days')
    .eq('pilot_id', user.id)
    .eq('month', month)
    .maybeSingle();
  const days = (sub?.days as AvailabilityDay[] | null) ?? [];
  if (days.length === 0) {
    return NextResponse.json({ error: 'no_availability', detail: 'No availability entered for this month.' }, { status: 400 });
  }

  const season = resolveSeason(pilot.season_override ?? null, new Date(month));

  try {
    const tokens = await refreshAccessToken(pilot.google_refresh_token);
    let created = 0, updated = 0;

    for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
      const notes: string[] = [];
      if (d.exclude_7am) notes.push('kein 07:10');
      if (d.exclude_5pm) notes.push('kein 17:00');
      const summary = `Tandem ${periodLabel(d.period)}${notes.length ? ` (${notes.join(', ')})` : ''}`;
      const range = availabilityDayTimeRange(d, season);
      // Timed event: first trip → last trip + flight time (1h15). If every slot
      // is opted out, fall back to an all-day marker.
      const entry: CalendarEntry = range
        ? { date: d.date, summary, startTime: range.start, endTime: range.end, description: 'Verfügbarkeit aus TandemLog.' }
        : { date: d.date, allDay: true, summary, description: 'Verfügbarkeit aus TandemLog.' };
      const r = await upsertCalendarEvent(entry, tokens.access_token, 'availability');
      if (r.action === 'created') created++; else updated++;
    }

    return NextResponse.json({ ok: true, created, updated, total: created + updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE { month: "YYYY-MM-01" }
 *
 * Removes every TandemLog availability event the app added for the month from
 * the pilot's Google Calendar (tag "availability:<date>"). Idempotent.
 */
export async function DELETE(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string };
  const month = body.month ?? '';
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: 'invalid_month', detail: 'month must be "YYYY-MM-01".' }, { status: 400 });
  }

  const { data: pilot, error } = await sb
    .from('pilots')
    .select('google_refresh_token')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pilot?.google_refresh_token) {
    return NextResponse.json({ error: 'not_connected', detail: 'Connect Google in Settings first.' }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessToken(pilot.google_refresh_token);
    const deleted = await deleteMonthCalendarEvents(month.slice(0, 7), tokens.access_token, 'availability');
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
