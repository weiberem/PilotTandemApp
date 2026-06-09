import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FlightForm } from '@/components/FlightForm';
import { isoDate, isoDateZurich, nowInZurich, formatDateDe } from '@/lib/utils';
import {
  getCurrentTripTimes, getNextTripTime, resolveSeason, suggestCurrentTripTime, type Season,
} from '@/lib/tripTimes';
import type { FlightInput } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export default async function LogPage({
  searchParams,
}: { searchParams: { added?: string; date?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase
    .from('pilots')
    .select('full_name, iban, primary_company_name, season_override, einsatzplan_schedule')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot || !pilot.full_name || !pilot.iban) redirect('/onboarding');

  const flightDate = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : isoDateZurich();

  const { data: existing } = await supabase
    .from('flights')
    .select('trip_time, company')
    .eq('flight_date', flightDate)
    .order('trip_time', { ascending: true });

  const season: Season = resolveSeason(pilot.season_override, new Date(flightDate));
  const seasonTimes = getCurrentTripTimes(season);

  // Pull pilot's scheduled trip times for this date from cached Einsatzplan (if any).
  // Schedule shape: { "YYYY-MM-DD": { period: "full"|"half_am"|"half_pm", times: ["07:10", ...] } }
  const scheduleEntry = (pilot.einsatzplan_schedule as Record<string, { times?: string[] }> | null)?.[flightDate];
  const scheduledTimes = scheduleEntry?.times ?? [...seasonTimes];

  const lastSkywings = [...(existing ?? [])]
    .reverse()
    .find(f => (f.company ?? '').toLowerCase().startsWith('skyw'));

  // Smart pre-fill:
  // - No flights logged yet → the trip time closest to "now":
  //     • before 09:00 → first scheduled time
  //     • later → latest published time already in the past (a flight is
  //       logged ~50-60 min after its departure)
  //   Only applied when logging TODAY; for a past/other date we start at the
  //   first scheduled time.
  // - Flights already logged → the NEXT trip time after the last one.
  const isToday = flightDate === isoDateZurich();
  let prefillTime: string;
  if (!lastSkywings) {
    const suggested = isToday
      ? suggestCurrentTripTime(scheduledTimes, nowInZurich())
      : scheduledTimes[0];
    prefillTime = suggested ?? scheduledTimes[0] ?? seasonTimes[0];
  } else {
    const next = getNextTripTime(lastSkywings.trip_time, season);
    prefillTime = next ?? scheduledTimes[scheduledTimes.length - 1] ?? seasonTimes[seasonTimes.length - 1];
  }

  const defaults: FlightInput = {
    flight_date: flightDate,
    trip_time: prefillTime,
    company: pilot.primary_company_name ?? 'Skywings',
    photo_status: 'none',
    is_no_show: false,
    is_double_airtime: false,
    tip_chf: 0,
    notes: null,
  };

  const justAdded = !!searchParams.added;
  const loggedCount = existing?.length ?? 0;

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-muted text-sm">{formatDateDe(new Date(flightDate))}</p>
          <h1 className="text-2xl font-display font-bold">Log Flight</h1>
        </div>
        <div className="text-right text-xs">
          <div className="text-text-muted">So far today</div>
          <div className="font-mono text-lg">{loggedCount}</div>
        </div>
      </div>

      {justAdded && (
        <div className="card p-3 border-l-4 border-l-success text-sm">
          ✓ Flight saved. Next departure time pre-filled.
        </div>
      )}

      <FlightForm
        mode="create"
        defaults={defaults}
        seasonOverride={pilot.season_override}
        primaryCompany={pilot.primary_company_name ?? 'Skywings'}
        scheduledTimes={scheduledTimes}
      />

      <div className="flex gap-2 pt-2">
        <Link href="/today" className="btn-ghost flex-1 border border-border">Today's Flights ({loggedCount})</Link>
        <Link href="/home" className="btn-ghost flex-1 border border-border">Done</Link>
      </div>
    </div>
  );
}
