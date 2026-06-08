import { SUMMER_TRIP_TIMES, WINTER_TRIP_TIMES, detectSeason } from './tripTimes';
import { buildInvoiceRows } from './invoice';
import { computeDayTotals, type PilotRates } from './flights';
import type { SupabaseClient } from '@supabase/supabase-js';

const RATES: PilotRates = {
  flight_rate_chf: 105,
  photo_prepaid_rate_chf: 40,
  thermal_rate_chf: 50,
  no_show_rate_chf: 32,
};

const COMPANY = 'Skywings Adventures GmbH';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function pickRandom<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n).sort();
}

function randomPhoto(): 'none' | 'PP' | 'CC' | 'C' {
  const r = Math.random();
  if (r < 0.16) return 'PP';
  if (r < 0.26) return 'CC';
  if (r < 0.32) return 'C';
  return 'none';
}

function randomTip(): number {
  const r = Math.random();
  if (r < 0.18) return [10, 20, 20, 30, 50][Math.floor(Math.random() * 5)];
  return 0;
}

type FlightRow = {
  pilot_id: string;
  flight_date: string;
  trip_time: string;
  company: string;
  photo_status: 'none' | 'PP' | 'CC' | 'C';
  is_no_show: boolean;
  is_double_airtime: boolean;
  tip_chf: number;
};

/**
 * Seeds a brand-new demo pilot with two realistic months of data:
 *   - Previous month: ~22 active days, ~80 flights, all verified, invoice sent
 *   - Current month: 5-6 active days within the past 10 days, ~22 flights,
 *     half verified, no invoice yet
 * Also pre-seeds a small Einsatzplan-Snapshot for the current month so the
 * Calendar tab shows the pilot-count overlay out of the box.
 */
export async function seedDemoPilot(
  svc: SupabaseClient,
  pilotId: string,
  now: Date = new Date(),
): Promise<void> {
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.getDate();

  const prevSeason = detectSeason(prevMonthStart);
  const currentSeason = detectSeason(currentMonthStart);
  const prevTimes = prevSeason === 'summer'
    ? SUMMER_TRIP_TIMES.slice(1, 8) // skip 07:10 and 17:00 edges
    : WINTER_TRIP_TIMES;
  const currentTimes = currentSeason === 'summer'
    ? SUMMER_TRIP_TIMES.slice(1, 8)
    : WINTER_TRIP_TIMES;

  // Previous month: pick 22 days out of available.
  const totalPrevDays = prevMonthEnd.getDate();
  const prevDayNumbers = pickRandom(
    Array.from({ length: totalPrevDays }, (_, i) => i + 1),
    Math.min(22, totalPrevDays),
  );

  const flights: FlightRow[] = [];
  const verifyDates: string[] = [];

  for (const dayNum of prevDayNumbers) {
    const date = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), dayNum);
    const dateIso = isoDate(date);
    const count = 3 + Math.floor(Math.random() * 3); // 3-5 flights
    const times = pickRandom(prevTimes, Math.min(count, prevTimes.length));
    for (const t of times) {
      flights.push({
        pilot_id: pilotId,
        flight_date: dateIso,
        trip_time: t,
        company: COMPANY,
        photo_status: randomPhoto(),
        is_no_show: false,
        is_double_airtime: Math.random() < 0.06,
        tip_chf: randomTip(),
      });
    }
    verifyDates.push(dateIso);
  }

  // Add 1 no-show somewhere in prev month.
  if (prevDayNumbers.length > 0) {
    const nsDay = prevDayNumbers[Math.floor(prevDayNumbers.length / 2)];
    const date = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), nsDay);
    flights.push({
      pilot_id: pilotId,
      flight_date: isoDate(date),
      trip_time: prevTimes[prevTimes.length - 1] ?? '16:00',
      company: COMPANY,
      photo_status: 'none',
      is_no_show: true,
      is_double_airtime: false,
      tip_chf: 0,
    });
  }

  // Current month: 5 active days within the last 10 days (but no future days).
  const currentMaxDay = Math.min(today, 28);
  if (currentMaxDay >= 3) {
    const earliest = Math.max(1, currentMaxDay - 10);
    const candidates = Array.from(
      { length: currentMaxDay - earliest + 1 },
      (_, i) => earliest + i,
    );
    const currentDayNumbers = pickRandom(candidates, Math.min(5, candidates.length));
    for (let i = 0; i < currentDayNumbers.length; i++) {
      const dayNum = currentDayNumbers[i];
      const date = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth(), dayNum);
      const dateIso = isoDate(date);
      const count = 3 + Math.floor(Math.random() * 3);
      const times = pickRandom(currentTimes, Math.min(count, currentTimes.length));
      for (const t of times) {
        flights.push({
          pilot_id: pilotId,
          flight_date: dateIso,
          trip_time: t,
          company: COMPANY,
          photo_status: randomPhoto(),
          is_no_show: false,
          is_double_airtime: Math.random() < 0.05,
          tip_chf: randomTip(),
        });
      }
      // Verify roughly the older half — keep the more recent days unverified
      // so the user has something to interact with via the verify-button.
      if (i >= Math.ceil(currentDayNumbers.length / 2)) {
        verifyDates.push(dateIso);
      }
    }
  }

  if (flights.length > 0) await svc.from('flights').insert(flights);
  if (verifyDates.length > 0) {
    await svc.from('day_verifications').insert(
      verifyDates.map(d => ({
        pilot_id: pilotId, flight_date: d, verified_at: new Date().toISOString(),
      })),
    );
  }

  // Mark previous-month invoice as sent (with demo number).
  const prevMonthFirst = isoDate(prevMonthStart);
  const prevFlights = flights.filter(f => f.flight_date.startsWith(prevMonthFirst.slice(0, 7)));
  const { totals } = buildInvoiceRows(
    prevFlights.map(f => ({
      photo_status: f.photo_status, is_no_show: f.is_no_show,
      is_double_airtime: f.is_double_airtime, tip_chf: f.tip_chf,
      flight_date: f.flight_date,
    })) as never[],
    RATES,
    prevMonthFirst,
  );
  const day = computeDayTotals(prevFlights, RATES);
  await svc.from('invoices').insert({
    pilot_id: pilotId,
    month: prevMonthFirst,
    company: COMPANY,
    status: 'sent',
    invoice_number: `DEMO-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`,
    total_chf: totals.amount || day.totalChf,
    flights_count: totals.flights || day.flightsBilled,
    pp_count: totals.pp || day.ppCount,
    thermal_count: totals.thermal || day.thermalCount,
    no_show_count: totals.noShow || day.noShowCount,
    sent_at: new Date().toISOString(),
  });

  // Pre-seed a small Einsatzplan slot for the current month so the Calendar
  // tab shows pilot counts immediately. Skip if column doesn't exist
  // (migration 005 not run on this Supabase instance).
  const currentMonthKey = isoDate(currentMonthStart).slice(0, 7);
  try {
    const { schedule, fullPlan } = buildSampleEinsatzplan(currentMonthStart);
    await svc.from('pilots').update({
      einsatzplan_imports: {
        [currentMonthKey]: {
          drive_link: 'demo://sample',
          file_id: 'demo',
          file_name: `Skywings Einsatzplan ${currentMonthKey} (Demo).xlsx`,
          schedule,
          full_plan: fullPlan,
          last_synced_at: new Date().toISOString(),
          archived: false,
        },
      },
      einsatzplan_schedule: schedule,
    }).eq('id', pilotId);
  } catch {
    // older instance — keep going
  }
}

const SAMPLE_PILOT_NAMES = [
  'Demo Pilot', 'David', 'Florian', 'Jonas', 'Läser', 'Lewis', 'Märki',
  'Olivier', 'Ospina', 'Ray', 'Reto', 'Sepp', 'Serena', 'Stefan', 'Steve',
] as const;

function buildSampleEinsatzplan(monthStart: Date): {
  schedule: Record<string, { period: 'full' | 'half_am' | 'half_pm'; times: string[] }>;
  fullPlan: { month: string; days: Record<string, { date: string; pilots: { name: string; period: 'full' | 'half_am' | 'half_pm'; number: number }[] }> };
} {
  const year = monthStart.getFullYear();
  const monthIdx0 = monthStart.getMonth();
  const lastDay = new Date(year, monthIdx0 + 1, 0).getDate();
  const monthFirst = isoDate(monthStart);

  const schedule: Record<string, { period: 'full' | 'half_am' | 'half_pm'; times: string[] }> = {};
  const days: Record<string, { date: string; pilots: { name: string; period: 'full' | 'half_am' | 'half_pm'; number: number }[] }> = {};

  const summerTimes = [...SUMMER_TRIP_TIMES.slice(1, 8)] as string[];

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, monthIdx0, d);
    const dow = date.getDay(); // 0=Sun, 1=Mon, etc.
    if (dow === 1 || dow === 2) continue; // pilot rests on Mo/Di in this sample
    const iso = isoDate(date);
    const period: 'full' | 'half_am' | 'half_pm' =
      dow === 0 ? 'half_am' : 'full';
    schedule[iso] = {
      period,
      times: period === 'full' ? summerTimes : summerTimes.slice(0, 4),
    };
    days[iso] = {
      date: iso,
      pilots: SAMPLE_PILOT_NAMES.map((name, i) => ({
        name, period: i % 7 === 0 ? 'half_pm' : 'full', number: i + 1,
      })),
    };
  }
  return {
    schedule,
    fullPlan: { month: `${monthFirst.slice(0, 7)}-01`, days },
  };
}
