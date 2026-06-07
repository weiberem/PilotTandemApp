import { describe, it, expect } from 'vitest';
import { computeDayTotals, flightInputSchema, type PilotRates } from './flights';

const RATES: PilotRates = {
  flight_rate_chf: 105,
  photo_prepaid_rate_chf: 40,
  thermal_rate_chf: 50,
  no_show_rate_chf: 32,
};

describe('computeDayTotals', () => {
  it('handles the spec example: 5 flights, 2 PP, 1 CC, 1 thermal, 1 no-show, 20 tip', () => {
    const flights = [
      { photo_status: 'PP', is_no_show: false, is_double_airtime: false, tip_chf: 0 },
      { photo_status: 'PP', is_no_show: false, is_double_airtime: false, tip_chf: 0 },
      { photo_status: 'CC', is_no_show: false, is_double_airtime: false, tip_chf: 0 },
      { photo_status: 'none', is_no_show: false, is_double_airtime: true, tip_chf: 0 },
      { photo_status: 'none', is_no_show: false, is_double_airtime: false, tip_chf: 20 },
      { photo_status: 'none', is_no_show: true, is_double_airtime: false, tip_chf: 0 },
    ] as const;
    const t = computeDayTotals(flights as any, RATES);
    expect(t.flightsBilled).toBe(5);
    expect(t.ppCount).toBe(2);
    expect(t.ccCount).toBe(1);
    expect(t.thermalCount).toBe(1);
    expect(t.noShowCount).toBe(1);
    expect(t.tipChf).toBe(20);
    expect(t.flightsChf).toBe(525);
    expect(t.ppChf).toBe(80);
    expect(t.ccChf).toBe(40);              // pilot keeps the CC-paid photo (not invoiced)
    expect(t.cChf).toBe(0);
    expect(t.thermalChf).toBe(50);
    expect(t.noShowChf).toBe(32);
    expect(t.totalChf).toBe(687);          // invoiced amount
    expect(t.personalTotalChf).toBe(727);  // invoice + CC + cash
    expect(t.totalWithTipsChf).toBe(747);  // personal + tip
  });

  it('no-show is NOT counted as a flight', () => {
    const t = computeDayTotals(
      [{ photo_status: 'none', is_no_show: true, is_double_airtime: false, tip_chf: 0 }] as any,
      RATES,
    );
    expect(t.flightsBilled).toBe(0);
    expect(t.noShowCount).toBe(1);
    expect(t.totalChf).toBe(32);
  });

  it('thermal IS counted as a flight (base + surcharge)', () => {
    const t = computeDayTotals(
      [{ photo_status: 'none', is_no_show: false, is_double_airtime: true, tip_chf: 0 }] as any,
      RATES,
    );
    expect(t.flightsBilled).toBe(1);
    expect(t.thermalCount).toBe(1);
    expect(t.totalChf).toBe(105 + 50);
  });

  it('empty array → zeros', () => {
    const t = computeDayTotals([], RATES);
    expect(t.totalChf).toBe(0);
    expect(t.flightsBilled).toBe(0);
  });
});

describe('flightInputSchema', () => {
  const base = {
    flight_date: '2025-06-01',
    trip_time: '08:10',
    company: 'Skywings',
    photo_status: 'none' as const,
    is_no_show: false,
    is_double_airtime: false,
    tip_chf: 0,
  };

  it('accepts a valid flight', () => {
    expect(flightInputSchema.safeParse(base).success).toBe(true);
  });

  it('rejects no-show + photo', () => {
    const r = flightInputSchema.safeParse({ ...base, is_no_show: true, photo_status: 'PP' });
    expect(r.success).toBe(false);
  });

  it('rejects no-show + thermal', () => {
    const r = flightInputSchema.safeParse({ ...base, is_no_show: true, is_double_airtime: true });
    expect(r.success).toBe(false);
  });

  it('rejects bad date format', () => {
    const r = flightInputSchema.safeParse({ ...base, flight_date: '01.06.2025' });
    expect(r.success).toBe(false);
  });

  it('rejects bad time format', () => {
    const r = flightInputSchema.safeParse({ ...base, trip_time: '8:10' });
    expect(r.success).toBe(false);
  });
});
