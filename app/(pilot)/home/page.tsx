import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatDateDe, isoDateZurich, nowInZurich, formatChf } from '@/lib/utils';
import {
  getCurrentTripTimes, prefillNextTripTime, resolveSeason, type Season,
} from '@/lib/tripTimes';
import { computeDayTotals, type FlightInput, type FlightRow, type PilotRates } from '@/lib/flights';
import { QuickAddFlightRow } from '@/components/QuickAddFlightRow';
import { FlightLine } from '@/components/FlightLine';
import { buildMonths, DayDetails, MonthDetails } from '@/components/HistoryAccordion';

export const dynamic = 'force-dynamic';

const HISTORY_MONTHS = 6;

function monthsAgoIso(months: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pilot } = await supabase.from('pilots').select('*').eq('id', user.id).maybeSingle();
  if (!pilot || !pilot.full_name || !pilot.iban) {
    redirect('/settings?welcome=1');
  }

  const today = isoDateZurich();
  const historyFrom = monthsAgoIso(HISTORY_MONTHS);

  const [{ data: rows }, { data: vers }] = await Promise.all([
    supabase.from('flights').select('*')
      .gte('flight_date', historyFrom)
      .order('flight_date', { ascending: false })
      .order('trip_time'),
    supabase.from('day_verifications').select('flight_date')
      .gte('flight_date', historyFrom),
  ]);

  const allFlights = (rows ?? []) as FlightRow[];
  const verifiedDates = new Set<string>((vers ?? []).map(v => v.flight_date as string));
  const todayFlights = allFlights.filter(f => f.flight_date === today)
    .sort((a, b) => a.trip_time.localeCompare(b.trip_time));

  const rates: PilotRates = {
    flight_rate_chf: Number(pilot.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot.no_show_rate_chf ?? 32),
  };
  const todayTotals = computeDayTotals(todayFlights, rates);

  const season: Season = resolveSeason(pilot.season_override, new Date(today));
  const seasonTimes = getCurrentTripTimes(season);
  const scheduleEntry = (pilot.einsatzplan_schedule as Record<string, { times?: string[] }> | null)?.[today];
  const scheduledTimes = scheduleEntry?.times ?? [...seasonTimes];
  const lastSkywings = [...todayFlights]
    .reverse()
    .find(f => (f.company ?? '').toLowerCase().startsWith('skyw'));
  const prefillTime = prefillNextTripTime({
    scheduledTimes, seasonTimes, season,
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

  const currentMonthKey = today.slice(0, 7);
  const months = buildMonths(allFlights, verifiedDates);
  const currentMonth = months.find(m => m.monthKey === currentMonthKey);
  const previousDaysThisMonth = currentMonth
    ? currentMonth.days.filter(d => d.date !== today)
    : [];
  const previousMonths = months.filter(m => m.monthKey !== currentMonthKey);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <section>
        <p className="text-text-muted text-sm">{formatDateDe(new Date())}</p>
        <h1 className="text-2xl font-display font-bold">Heute</h1>
      </section>

      <QuickAddFlightRow
        key={todayFlights.length}
        defaults={defaults}
        scheduledTimes={scheduledTimes}
        loggedCount={todayFlights.length}
      />

      {todayFlights.length > 0 && (
        <section className="card overflow-hidden">
          <div className="divide-y divide-border">
            {todayFlights.map(f => <FlightLine key={f.id} flight={f} indent="pl-3" />)}
          </div>
        </section>
      )}

      <section className="card p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat n={todayTotals.flightsBilled} label="Flüge" />
          <Stat n={todayTotals.ppCount} label="PP" />
          <Stat n={todayTotals.noShowCount} label="No-Show" />
          <Stat n={todayTotals.tipChf} label="Trinkgeld" chf />
        </div>
        <div className="mt-4 flex gap-2">
          <Link href="/summary" className="btn-primary flex-1">Tagesabschluss</Link>
          <Link href="/flights" className="btn-ghost flex-1 border border-border">
            <CalendarRange className="w-4 h-4 mr-2" /> Monatsübersicht
          </Link>
        </div>
      </section>

      {previousDaysThisMonth.length > 0 && (
        <section>
          <details className="card overflow-hidden group">
            <summary className="flex items-center gap-3 p-3 cursor-pointer list-none hover:bg-bg-subtle">
              <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:rotate-180" />
              <div className="flex-1">
                <div className="font-display font-semibold">Vorherige Tage diesen Monat</div>
                <div className="text-xs text-text-muted">{previousDaysThisMonth.length} Tag{previousDaysThisMonth.length === 1 ? '' : 'e'}</div>
              </div>
            </summary>
            <div className="border-t border-border">
              {previousDaysThisMonth.map(d => <DayDetails key={d.date} day={d} rates={rates} />)}
            </div>
          </details>
        </section>
      )}

      {previousMonths.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-text-muted px-1">Vorherige Monate</h2>
          {previousMonths.map(m => <MonthDetails key={m.monthKey} month={m} rates={rates} />)}
        </section>
      )}

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

function Stat({ n, label, chf = false }: { n: number; label: string; chf?: boolean }) {
  return (
    <div>
      <div className="text-2xl font-mono font-semibold">{chf ? formatChf(n) : n}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
