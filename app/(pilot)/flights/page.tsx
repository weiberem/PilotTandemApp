import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import { MonthFlightsView, type DayGroup } from './MonthFlightsView';

export const dynamic = 'force-dynamic';

function monthRange(month: string): { first: string; last: string; year: number; monthIndex0: number } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    first: `${y}-${String(m).padStart(2, '0')}-01`,
    last: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    year: y,
    monthIndex0: m - 1,
  };
}

export default async function FlightsPage({
  searchParams,
}: { searchParams: { month?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '')
    ? (searchParams.month as string)
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { first, last, year, monthIndex0 } = monthRange(month);

  const [{ data: pilot }, { data: rows }] = await Promise.all([
    supabase.from('pilots').select(
      'flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf',
    ).eq('id', user.id).maybeSingle(),
    supabase.from('flights').select('*')
      .gte('flight_date', first).lte('flight_date', last)
      .order('flight_date').order('trip_time'),
  ]);

  const rates: PilotRates = {
    flight_rate_chf: Number(pilot?.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot?.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot?.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot?.no_show_rate_chf ?? 32),
  };

  const flights = (rows ?? []) as FlightRow[];
  const byDate = new Map<string, FlightRow[]>();
  for (const f of flights) {
    const list = byDate.get(f.flight_date) ?? [];
    list.push(f);
    byDate.set(f.flight_date, list);
  }
  const days: DayGroup[] = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, list]) => ({ date, flights: list, totals: computeDayTotals(list, rates) }));

  const monthTotals = computeDayTotals(flights, rates);

  return (
    <MonthFlightsView
      month={month}
      year={year}
      monthIndex0={monthIndex0}
      days={days}
      monthTotals={monthTotals}
    />
  );
}
