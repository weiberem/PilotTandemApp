import { describe, it, expect } from 'vitest';
import { yearStats, monthlyStats } from './stats';
import type { PilotRates } from './flights';

const RATES: PilotRates = {
  flight_rate_chf: 105,
  photo_prepaid_rate_chf: 40,
  thermal_rate_chf: 50,
  no_show_rate_chf: 32,
};

const F = (date: string, opts: Partial<{ company: string; noShow: boolean; pp: boolean; thermal: boolean }> = {}) => ({
  id: date + Math.random(),
  pilot_id: 'p',
  flight_date: date,
  trip_time: '08:10',
  company: opts.company ?? 'Skywings',
  photo_status: (opts.pp ? 'PP' : 'none') as 'PP' | 'none',
  is_no_show: !!opts.noShow,
  is_double_airtime: !!opts.thermal,
  tip_chf: 0,
  notes: null,
  created_at: '',
  updated_at: '',
});

describe('monthlyStats', () => {
  it('buckets flights by month and ignores other years', () => {
    const m = monthlyStats([F('2025-01-15'), F('2025-01-20', { pp: true }), F('2024-12-31')] as any, RATES, 2025);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ label: 'Jan', flights: 2, pp: 1, revenue: 2 * 105 + 40 });
    expect(m[11].flights).toBe(0);
  });
});

describe('yearStats', () => {
  it('separates primary company from others; VKPI counts all non-no-show', () => {
    const flights = [
      F('2025-01-10', { company: 'Skywings' }),
      F('2025-01-11', { company: 'Skywings', thermal: true }),
      F('2025-02-05', { company: 'AlpinAir' }),
      F('2025-03-01', { company: 'Skywings', noShow: true }),
    ];
    const s = yearStats(flights as any, RATES, 2025, 'Skywings');
    expect(s.totals.flights).toBe(2);                 // Skywings only, no no-show
    expect(s.totals.revenue).toBe(2 * 105 + 50 + 32); // 2 flights + thermal + no-show
    expect(s.byCompany).toEqual([{ company: 'AlpinAir', flights: 1, revenue: 105 }]);
    expect(s.vkpiFlights).toBe(3);                    // all non-no-show across companies
  });
});
