import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SummaryActions } from '@/components/SummaryActions';
import { DayVerifyControl } from '@/components/DayVerifyControl';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import { isoDateZurich } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SummaryPage({
  searchParams,
}: { searchParams: { date?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : isoDateZurich();

  const [{ data: pilot }, { data: rows }, { data: verification }] = await Promise.all([
    supabase.from('pilots').select('full_name, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf').eq('id', user.id).maybeSingle(),
    supabase.from('flights').select('*').eq('flight_date', date).order('trip_time'),
    supabase.from('day_verifications')
      .select('verified_at')
      .eq('pilot_id', user.id)
      .eq('flight_date', date)
      .maybeSingle(),
  ]);

  const flights = (rows ?? []) as FlightRow[];
  const rates: PilotRates = {
    flight_rate_chf: Number(pilot?.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot?.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot?.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot?.no_show_rate_chf ?? 32),
  };
  const totals = computeDayTotals(flights, rates);

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Day Summary</h1>
        <Link href={`/today?date=${date}`} className="text-sm text-text-muted">Edit</Link>
      </div>

      {flights.length === 0 ? (
        <div className="card p-6 text-center text-text-muted">
          No flights on this day.
        </div>
      ) : (
        <>
          <SummaryActions
            pilotName={pilot?.full_name ?? ''}
            date={date}
            totals={totals}
            rates={rates}
          />
          <DayVerifyControl
            date={date}
            verifiedAt={(verification?.verified_at as string | undefined) ?? null}
            flightCount={flights.length}
          />
        </>
      )}
    </div>
  );
}
