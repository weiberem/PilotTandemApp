import type { FlightRow, PilotRates } from './flights';
import { computeDayTotals } from './flights';

export type MonthlyStat = {
  monthIndex0: number;   // 0..11
  label: string;         // "Jan", "Feb", ...
  flights: number;       // billable flights (non-no-show)
  pp: number;
  thermal: number;
  noShow: number;
  revenue: number;
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function monthlyStats(
  flights: FlightRow[],
  rates: PilotRates,
  year: number,
): MonthlyStat[] {
  const buckets: MonthlyStat[] = SHORT_MONTHS.map((label, monthIndex0) => ({
    monthIndex0, label, flights: 0, pp: 0, thermal: 0, noShow: 0, revenue: 0,
  }));
  const byMonth = new Map<number, FlightRow[]>();
  for (const f of flights) {
    const [y, m] = f.flight_date.split('-').map(Number);
    if (y !== year) continue;
    const list = byMonth.get(m - 1) ?? [];
    list.push(f);
    byMonth.set(m - 1, list);
  }
  for (const [mi, list] of byMonth.entries()) {
    const t = computeDayTotals(list, rates);
    buckets[mi].flights = t.flightsBilled;
    buckets[mi].pp = t.ppCount;
    buckets[mi].thermal = t.thermalCount;
    buckets[mi].noShow = t.noShowCount;
    buckets[mi].revenue = t.totalChf; // tips not invoiced
  }
  return buckets;
}

export type YearStats = {
  months: MonthlyStat[];
  totals: {
    flights: number;
    pp: number;
    thermal: number;
    noShow: number;
    revenue: number;
  };
  /** All non-no-show flights across all companies — for VKPI-Meldung. */
  vkpiFlights: number;
  byCompany: { company: string; flights: number; revenue: number }[];
};

export function yearStats(
  flightsAllCompanies: FlightRow[],
  rates: PilotRates,
  year: number,
  primaryCompany: string,
): YearStats {
  const inYear = flightsAllCompanies.filter(f => f.flight_date.startsWith(`${year}-`));
  const months = monthlyStats(
    inYear.filter(f => f.company === primaryCompany),
    rates,
    year,
  );
  const t = months.reduce(
    (a, m) => ({
      flights: a.flights + m.flights,
      pp: a.pp + m.pp,
      thermal: a.thermal + m.thermal,
      noShow: a.noShow + m.noShow,
      revenue: a.revenue + m.revenue,
    }),
    { flights: 0, pp: 0, thermal: 0, noShow: 0, revenue: 0 },
  );

  // VKPI counts ALL non-no-show flights across ALL companies.
  const vkpiFlights = inYear.filter(f => !f.is_no_show).length;

  // Other-company breakdown (excluding primary).
  const byCompanyMap = new Map<string, FlightRow[]>();
  for (const f of inYear) {
    if (f.company === primaryCompany) continue;
    const list = byCompanyMap.get(f.company) ?? [];
    list.push(f);
    byCompanyMap.set(f.company, list);
  }
  const byCompany = [...byCompanyMap.entries()]
    .map(([company, list]) => {
      const tot = computeDayTotals(list, rates);
      return { company, flights: tot.flightsBilled, revenue: tot.totalChf };
    })
    .sort((a, b) => b.flights - a.flights);

  return { months, totals: t, vkpiFlights, byCompany };
}
