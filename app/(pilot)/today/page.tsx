import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FlightListItem } from '@/components/FlightListItem';
import { formatDateDe, isoDate, formatChf } from '@/lib/utils';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export default async function TodayPage({
  searchParams,
}: { searchParams: { date?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : isoDate();

  const [{ data: pilot }, { data: rows }] = await Promise.all([
    supabase.from('pilots').select('flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf').eq('id', user.id).maybeSingle(),
    supabase.from('flights').select('*').eq('flight_date', date).order('trip_time'),
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
      <div>
        <p className="text-text-muted text-sm">{formatDateDe(new Date(date))}</p>
        <h1 className="text-2xl font-display font-bold">Heutige Flüge</h1>
      </div>

      {flights.length === 0 ? (
        <div className="card p-6 text-center text-text-muted">
          <p>Noch keine Flüge heute.</p>
          <Link href="/log" className="btn-accent mt-4 inline-flex">Ersten Flug erfassen</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {flights.map(f => <FlightListItem key={f.id} flight={f} />)}
          </ul>
          <div className="card p-4 grid grid-cols-2 gap-2 text-sm">
            <span className="text-text-muted">Flüge</span><span className="font-mono text-right">{totals.flightsBilled}</span>
            <span className="text-text-muted">Foto PP</span><span className="font-mono text-right">{totals.ppCount}</span>
            <span className="text-text-muted">Thermal</span><span className="font-mono text-right">{totals.thermalCount}</span>
            <span className="text-text-muted">No-Show</span><span className="font-mono text-right">{totals.noShowCount}</span>
            <span className="text-text-muted">Trinkgeld</span><span className="font-mono text-right">{formatChf(totals.tipChf)}</span>
            <span className="font-semibold border-t border-border pt-2">Total (m. Tip)</span>
            <span className="font-mono text-right font-semibold border-t border-border pt-2">{formatChf(totals.totalWithTipsChf)}</span>
          </div>
          <div className="flex gap-2">
            <Link href="/log" className="btn-ghost flex-1 border border-border">+ Weiterer Flug</Link>
            <Link href={`/summary?date=${date}`} className="btn-primary flex-1">Tagesabschluss</Link>
          </div>
        </>
      )}
    </div>
  );
}
