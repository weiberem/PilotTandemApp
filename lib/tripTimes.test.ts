import { describe, it, expect } from 'vitest';
import {
  SUMMER_TRIP_TIMES,
  WINTER_TRIP_TIMES,
  detectSeason,
  resolveSeason,
  getCurrentTripTimes,
  getNextTripTime,
  isOptionalSummerTime,
  suggestCurrentTripTime,
} from './tripTimes';

describe('trip time constants', () => {
  it('summer has 9 times incl. optional 07:10 and 17:00', () => {
    expect(SUMMER_TRIP_TIMES).toHaveLength(9);
    expect(SUMMER_TRIP_TIMES[0]).toBe('07:10');
    expect(SUMMER_TRIP_TIMES[SUMMER_TRIP_TIMES.length - 1]).toBe('17:00');
  });

  it('winter has 6 times', () => {
    expect(WINTER_TRIP_TIMES).toHaveLength(6);
    expect(WINTER_TRIP_TIMES[0]).toBe('08:30');
    expect(WINTER_TRIP_TIMES[WINTER_TRIP_TIMES.length - 1]).toBe('15:00');
  });
});

describe('detectSeason', () => {
  it('April–October → summer', () => {
    for (const m of [4, 5, 6, 7, 8, 9, 10]) {
      expect(detectSeason(new Date(2025, m - 1, 15))).toBe('summer');
    }
  });
  it('November–March → winter', () => {
    for (const m of [11, 12, 1, 2, 3]) {
      expect(detectSeason(new Date(2025, m - 1, 15))).toBe('winter');
    }
  });
});

describe('resolveSeason', () => {
  it('respects override', () => {
    expect(resolveSeason('summer', new Date(2025, 0, 1))).toBe('summer');
    expect(resolveSeason('winter', new Date(2025, 6, 1))).toBe('winter');
  });
  it('falls back to detect when null/undefined', () => {
    expect(resolveSeason(null, new Date(2025, 6, 1))).toBe('summer');
    expect(resolveSeason(undefined, new Date(2025, 0, 1))).toBe('winter');
  });
});

describe('getNextTripTime', () => {
  it('returns next summer trip time', () => {
    expect(getNextTripTime('08:10', 'summer')).toBe('09:20');
    expect(getNextTripTime('16:00', 'summer')).toBe('17:00');
  });
  it('returns null when current is last', () => {
    expect(getNextTripTime('17:00', 'summer')).toBeNull();
    expect(getNextTripTime('15:00', 'winter')).toBeNull();
  });
  it('returns null for unknown time', () => {
    expect(getNextTripTime('99:99', 'summer')).toBeNull();
  });
});

describe('isOptionalSummerTime', () => {
  it('flags 07:10 and 17:00', () => {
    expect(isOptionalSummerTime('07:10')).toBe(true);
    expect(isOptionalSummerTime('17:00')).toBe(true);
    expect(isOptionalSummerTime('08:10')).toBe(false);
  });
});

describe('suggestCurrentTripTime', () => {
  const summer = [...SUMMER_TRIP_TIMES]; // 07:10 08:10 09:20 10:30 11:45 13:30 14:45 16:00 17:00

  it('before 09:00 → first scheduled time', () => {
    expect(suggestCurrentTripTime(summer, new Date(2025, 5, 1, 8, 0))).toBe('07:10');
  });

  it('before 09:00 without 07:10 → earliest scheduled', () => {
    const noEarly = summer.filter(t => t !== '07:10'); // starts 08:10
    expect(suggestCurrentTripTime(noEarly, new Date(2025, 5, 1, 6, 30))).toBe('08:10');
  });

  it('at 11:16 → latest past time 10:30 (real-world bug case)', () => {
    expect(suggestCurrentTripTime(summer, new Date(2025, 5, 1, 11, 16))).toBe('10:30');
  });

  it('at 12:50 → 11:45', () => {
    expect(suggestCurrentTripTime(summer, new Date(2025, 5, 1, 12, 50))).toBe('11:45');
  });

  it('at 14:30 → 13:30', () => {
    expect(suggestCurrentTripTime(summer, new Date(2025, 5, 1, 14, 30))).toBe('13:30');
  });

  it('late evening → last time of the day', () => {
    expect(suggestCurrentTripTime(summer, new Date(2025, 5, 1, 22, 0))).toBe('17:00');
  });

  it('09:00 exactly but before the 09:20 slot → still first (07:10)', () => {
    // at 09:05 no published time <= now except 07:10/08:10 → latest past is 08:10
    expect(suggestCurrentTripTime(summer, new Date(2025, 5, 1, 9, 5))).toBe('08:10');
  });

  it('empty schedule → null', () => {
    expect(suggestCurrentTripTime([], new Date())).toBeNull();
  });
});

describe('getCurrentTripTimes', () => {
  it('returns correct list per season', () => {
    expect(getCurrentTripTimes('summer')).toEqual(SUMMER_TRIP_TIMES);
    expect(getCurrentTripTimes('winter')).toEqual(WINTER_TRIP_TIMES);
  });
});
