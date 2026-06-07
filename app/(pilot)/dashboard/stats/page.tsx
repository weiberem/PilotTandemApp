import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { yearStats } from '@/lib/stats';
import { MonthlyChart } from '@/components/StatsCharts';
import { VkpiCard } from '@/components/VkpiCard';
import { YearPicker } from './YearPicker';
import { formatChf } from '@/lib/utils';
import type { FlightRow, PilotRates } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export default async function StatsPage({
  searchParams,
}: { searchParams: { year?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const currentYear = new Date().getFullYear();
  const year = /^\d{4}$/.test(searchParams.year ?? '') ? Number(searchParams.year) : currentYear;

  const [{ data: pilot }, { data: flightRows }] = await Promise.all([
    supabase.from('pilots').select(
      'primary_company_name, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf',
    ).eq('id', user.id).maybeSingle(),
    supabase.from('flights').select('*')
      .gte('flight_date', `${year}-01-01`)
      .lte('flight_date', `${year}-12-31`),
  ]);

  const rates: PilotRates = {
    flight_rate_chf: Number(pilot?.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot?.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot?.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot?.no_show_rate_chf ?? 32),
  };
  const primaryCompany = pilot?.primary_company_name ?? 'Skywings';
  const stats = yearStats((flightRows ?? []) as FlightRow[], rates, year, primaryCompany);

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Statistik</h1>
          <p className="text-text-muted text-sm">{primaryCompany} · Jahr {year}</p>
        </div>
        <YearPicker year={year} options={yearOptions} />
      </div>

      <VkpiCard year={year} count={stats.vkpiFlights} />

      <MonthlyChart data={stats.months} />

      <div className="card p-4 overflow-x-auto">
        <h2 className="font-display font-semibold mb-2">Jahresdetail</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted text-xs uppercase">
                <th className="py-1">Monat</th>
                <th className="text-right">Flüge</th>
                <th className="text-right">PP</th>
                <th className="text-right">Thermal</th>
                <th className="text-right">No-Show</th>
                <th className="text-right">Umsatz</th>
              </tr>
            </thead>
            <tbody>
              {stats.months.map(m => {
                const monthParam = `${year}-${String(m.monthIndex0 + 1).padStart(2, '0')}`;
                return (
                  <tr key={m.monthIndex0} className="border-t border-border hover:bg-bg">
                    <td className="py-1">
                      <Link href={`/flights?month=${monthParam}`} className="text-primary hover:underline">
                        {m.label}
                      </Link>
                    </td>
                    <td className="font-mono text-right">{m.flights}</td>
                    <td className="font-mono text-right">{m.pp}</td>
                    <td className="font-mono text-right">{m.thermal}</td>
                    <td className="font-mono text-right">{m.noShow}</td>
                    <td className="font-mono text-right">{formatChf(m.revenue)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-text font-semibold">
                <td className="py-1">Total</td>
                <td className="font-mono text-right">{stats.totals.flights}</td>
                <td className="font-mono text-right">{stats.totals.pp}</td>
                <td className="font-mono text-right">{stats.totals.thermal}</td>
                <td className="font-mono text-right">{stats.totals.noShow}</td>
                <td className="font-mono text-right">{formatChf(stats.totals.revenue)}</td>
              </tr>
            </tbody>
        </table>
      </div>

      {stats.byCompany.length > 0 && (
        <div className="card p-4">
          <h2 className="font-display font-semibold mb-2">Andere Firmen</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted text-xs uppercase">
                <th className="py-1">Firma</th>
                <th className="text-right">Flüge</th>
                <th className="text-right">Umsatz</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stats.byCompany.map(c => (
                <tr key={c.company} className="border-t border-border">
                  <td className="py-1">{c.company}</td>
                  <td className="font-mono text-right">{c.flights}</td>
                  <td className="font-mono text-right">{formatChf(c.revenue)}</td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/invoice?month=${year}-01-01&company=${encodeURIComponent(c.company)}`}
                      className="text-primary text-xs"
                    >Rechnung →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
