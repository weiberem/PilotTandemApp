import { describe, it, expect } from 'vitest';
import {
  buildInvoiceRows, daysInMonth, applyVat, formatInvoiceNumber, monthLabelDe,
} from './invoice';
import type { PilotRates } from './flights';

const RATES: PilotRates = {
  flight_rate_chf: 105,
  photo_prepaid_rate_chf: 40,
  thermal_rate_chf: 50,
  no_show_rate_chf: 32,
};

describe('daysInMonth', () => {
  it.each([
    ['2025-01-01', 31],
    ['2025-02-01', 28],
    ['2024-02-01', 29],
    ['2025-04-01', 30],
  ])('%s → %d', (m, n) => expect(daysInMonth(m)).toBe(n));
});

describe('buildInvoiceRows', () => {
  it('rolls daily flights into per-day rows with correct amounts', () => {
    const flights = [
      // Day 1: 3 flights, 1 PP
      { flight_date: '2025-01-01', is_no_show: false, photo_status: 'none', is_double_airtime: false },
      { flight_date: '2025-01-01', is_no_show: false, photo_status: 'PP',   is_double_airtime: false },
      { flight_date: '2025-01-01', is_no_show: false, photo_status: 'none', is_double_airtime: false },
      // Day 5: 1 thermal flight
      { flight_date: '2025-01-05', is_no_show: false, photo_status: 'none', is_double_airtime: true  },
      // Day 7: 1 no-show
      { flight_date: '2025-01-07', is_no_show: true,  photo_status: 'none', is_double_airtime: false },
    ];
    const { rows, totals } = buildInvoiceRows(flights as any, RATES, '2025-01-01');

    expect(rows).toHaveLength(31);
    expect(rows[0]).toMatchObject({ day: 1, flights: 3, pp: 1, amount: 3 * 105 + 40 });
    expect(rows[4]).toMatchObject({ day: 5, flights: 1, thermal: 1, amount: 105 + 50 });
    expect(rows[6]).toMatchObject({ day: 7, flights: 0, noShow: 1, amount: 32 });

    expect(totals.flights).toBe(4);
    expect(totals.pp).toBe(1);
    expect(totals.thermal).toBe(1);
    expect(totals.noShow).toBe(1);
    expect(totals.amount).toBe(3 * 105 + 40 + 105 + 50 + 32);
  });
});

describe('applyVat', () => {
  it('extracts inclusive VAT at 8.1%', () => {
    const { net, vat } = applyVat(108.10, 0.081);
    expect(net).toBeCloseTo(100, 2);
    expect(vat).toBeCloseTo(8.10, 2);
  });
});

describe('formatInvoiceNumber', () => {
  it('zero-pads to 3 digits', () => {
    expect(formatInvoiceNumber(2025, 1)).toBe('2025-001');
    expect(formatInvoiceNumber(2025, 42)).toBe('2025-042');
  });
});

describe('monthLabelDe', () => {
  it('formats a German month label', () => {
    expect(monthLabelDe('2025-01-01').toLowerCase()).toContain('januar');
  });
});
