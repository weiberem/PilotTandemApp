import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatDateDe, isoDateZurich, nowInZurich, formatChf } from '@/lib/utils';
import {
  getCurrentTripTimes, prefillNextTripTime, resolveSeason, type Season,
} from '@/lib/tripTimes';
import { QuickAddFlightRow } from '@/components/QuickAddFlightRow';
import type { FlightInput } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase.from('pilots').select('*').eq('id', user.id).maybeSingle();
  if (!pilot || !pilot.full_name || !pilot.iban) {
    redirect('/settings?welcome=1');
  }

  const today = isoDateZurich();
  const { data: flights } = await supabase
    .from('flights')
    .select('id, photo_status, is_no_show, is_double_airtime, tip_chf, trip_time, company')
    .eq('flight_date', today)
    .order('trip_time');

  const list = flights ?? [];
  const totalFlights = list.filter(f => !f.is_no_show).length;
  const totalPhoto = list.filter(f => f.photo_status === 'PP').length;
  const totalNoShow = list.filter(f => f.is_no_show).length;
  const totalTip = list.reduce((sum, f) => sum + Number(f.tip_chf ?? 0), 0);

  const season: Season = resolveSeason(pilot.season_override, new Date(today));
  const seasonTimes = getCurrentTripTimes(season);
  const scheduleEntry = (pilot.einsatzplan_schedule as Record<string, { times?: string[] }> | null)?.[today];
  const scheduledTimes = scheduleEntry?.times ?? [...seasonTimes];

  const lastSkywings = [...list]
    .reverse()
    .find(f => (f.company ?? '').toLowerCase().startsWith('skyw'));

  const prefillTime = prefillNextTripTime({
    scheduledTimes,
    seasonTimes,
    season,
    lastSkywingsTime: lastSkywings?.trip_time ?? null,
    isToday: true,
    now: nowInZurich(),
  });

  const defaults: FlightInput = {
    flight_date: today,
    trip_time: prefillTime,
    company: pilot.primary_company_name ?? 'Skywings',
    photo_status: 'none',
    is_no_show: false,
    is_double_airtime: false,
    tip_chf: 0,
    notes: null,
  };

  return (
    <div className="p-4 space-y-4">
      <section>
        <p className="text-text-muted text-sm">{formatDateDe(new Date())}</p>
        <h1 className="text-2xl font-display font-bold">Heute</h1>
      </section>

      <QuickAddFlightRow
        defaults={defaults}
        scheduledTimes={scheduledTimes}
        loggedCount={list.length}
      />

      <section className="card p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-2xl font-mono font-semibold">{totalFlights}</div>
            <div className="text-xs text-text-muted">Flüge</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-semibold">{totalPhoto}</div>
            <div className="text-xs text-text-muted">PP</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-semibold">{totalNoShow}</div>
            <div className="text-xs text-text-muted">No-Show</div>
          </div>
          <div>
            <div className="text-2xl font-mono font-semibold">{formatChf(totalTip)}</div>
            <div className="text-xs text-text-muted">Trinkgeld</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Link href="/today" className="btn-ghost flex-1 border border-border">Heutige Flüge</Link>
          <Link href="/summary" className="btn-primary flex-1">Tagesabschluss</Link>
        </div>
        <Link href="/flights" className="btn-ghost w-full border border-border mt-2 text-sm">
          <CalendarRange className="w-4 h-4 mr-2" /> Alle Flüge (Monatsübersicht)
        </Link>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">Einsatzplan</div>
            <div className="text-xs text-text-muted truncate">
              {pilot.einsatzplan_synced_at
                ? `Zuletzt importiert: ${formatDateDe(pilot.einsatzplan_synced_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : pilot.google_refresh_token ? 'Bereit für Import' : 'Noch nicht verbunden'}
            </div>
          </div>
          <Link href="/einsatzplan" className="btn-ghost border border-border text-sm">
            {pilot.einsatzplan_synced_at ? 'Neuer Monat' : pilot.google_refresh_token ? 'Importieren' : 'Verbinden'}
          </Link>
        </div>
      </section>
    </div>
  );
}
