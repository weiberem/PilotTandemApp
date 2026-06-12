import { describe, it, expect } from 'vitest';
import { deriveCcTripTimes } from './sumup';

const SUMMER = ['07:10', '08:10', '09:20', '10:30', '11:45', '13:30', '14:45', '16:00', '17:00'];

describe('deriveCcTripTimes', () => {
  it('maps a midday payment to the trip ~1h earlier', () => {
    expect(deriveCcTripTimes(['12:50'], SUMMER)).toEqual([{ payment: '12:50', trip: '11:45' }]);
  });

  it('handles the tight morning case: 08:15 payment → 07:10 flight, not 08:10', () => {
    expect(deriveCcTripTimes(['08:15'], SUMMER)).toEqual([{ payment: '08:15', trip: '07:10' }]);
  });

  it('matches each trip only once', () => {
    const r = deriveCcTripTimes(['12:50', '13:00'], SUMMER);
    const trips = r.map(x => x.trip);
    expect(new Set(trips).size).toBe(trips.length); // all distinct
    expect(trips).toContain('11:45');
  });

  it('maps the real SumUp day (6× 40 CHF) to sensible trips', () => {
    const r = deriveCcTripTimes(['09:04', '10:26', '11:44', '14:31', '15:36', '17:08'], SUMMER);
    const m = Object.fromEntries(r.map(x => [x.payment, x.trip]));
    expect(m['09:04']).toBe('08:10');  // 54 min after
    expect(m['10:26']).toBe('09:20');  // 66 min
    expect(m['11:44']).toBe('10:30');  // 74 min
    expect(m['14:31']).toBe('13:30');  // 61 min
    expect(m['15:36']).toBe('14:45');  // 51 min
    expect(m['17:08']).toBe('16:00');  // 68 min
    expect(new Set(Object.values(m)).size).toBe(6); // all distinct trips
  });

  it('returns null when no plausible earlier trip exists', () => {
    expect(deriveCcTripTimes(['06:00'], SUMMER)).toEqual([{ payment: '06:00', trip: null }]);
  });
});
