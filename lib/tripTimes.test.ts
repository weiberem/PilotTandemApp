import { describe, it, expect } from 'vitest';
import {
  SUMMER_TRIP_TIMES,
  WINTER_TRIP_TIMES,
  detectSeason,
  resolveSeason,
  getCurrentTripTimes,
  getNextTripTime,
  isOptionalSummerTime,
  suggestFirstTripTime,
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

describe('suggestFirstTripTime', () => {
  const summerSchedule = [...SUMMER_TRIP_TIMES];

  it('suggests 07:10 before 09:10 if scheduled', () => {
    const at0800 = new Date(2025, 5, 1, 8, 0);
    expect(suggestFirstTripTime('summer', summerSchedule, at0800)).toBe('07:10');
  });

  it('returns null at 09:10 or later', () => {
    const at0910 = new Date(2025, 5, 1, 9, 10);
    expect(suggestFirstTripTime('summer', summerSchedule, at0910)).toBeNull();
  });

  it('returns null when pilot is not scheduled for 07:10', () => {
    const withoutEarly = summerSchedule.filter(t => t !== '07:10');
    const at0800 = new Date(2025, 5, 1, 8, 0);
    expect(suggestFirstTripTime('summer', withoutEarly, at0800)).toBeNull();
  });

  it('returns null in winter', () => {
    const at0800 = new Date(2025, 0, 1, 8, 0);
    expect(suggestFirstTripTime('winter', [...WINTER_TRIP_TIMES], at0800)).toBeNull();
  });
});

describe('getCurrentTripTimes', () => {
  it('returns correct list per season', () => {
    expect(getCurrentTripTimes('summer')).toEqual(SUMMER_TRIP_TIMES);
    expect(getCurrentTripTimes('winter')).toEqual(WINTER_TRIP_TIMES);
  });
});
