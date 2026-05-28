export const SUMMER_TRIP_TIMES = [
  '07:10', // optional — pilot can opt out
  '08:10',
  '09:20',
  '10:30',
  '11:45',
  '13:30',
  '14:45',
  '16:00',
  '17:00', // optional — pilot can opt out
] as const;

export const WINTER_TRIP_TIMES = [
  '08:30',
  '09:45',
  '11:00',
  '12:15',
  '13:45',
  '15:00',
] as const;

export const OPTIONAL_SUMMER_TIMES = ['07:10', '17:00'] as const;

export type Season = 'summer' | 'winter';

export function getCurrentTripTimes(season: Season): readonly string[] {
  return season === 'summer' ? SUMMER_TRIP_TIMES : WINTER_TRIP_TIMES;
}

export function detectSeason(date: Date = new Date()): Season {
  const month = date.getMonth() + 1; // 1–12
  return month >= 4 && month <= 10 ? 'summer' : 'winter';
}

export function resolveSeason(override: string | null | undefined, date: Date = new Date()): Season {
  if (override === 'summer' || override === 'winter') return override;
  return detectSeason(date);
}

export function getNextTripTime(currentTime: string, season: Season): string | null {
  const times = getCurrentTripTimes(season);
  const idx = times.indexOf(currentTime);
  if (idx < 0) return null;
  if (idx >= times.length - 1) return null;
  return times[idx + 1];
}

export function isOptionalSummerTime(time: string): boolean {
  return (OPTIONAL_SUMMER_TIMES as readonly string[]).includes(time);
}

/**
 * Smart pre-fill for first flight of the day:
 * - Before 09:10 AND scheduled for 07:10 → suggest "07:10"
 * - Otherwise → no suggestion (caller should prompt for selection)
 */
export function suggestFirstTripTime(
  season: Season,
  scheduledTimes: readonly string[],
  now: Date = new Date(),
): string | null {
  if (season !== 'summer') return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const before0910 = minutes < 9 * 60 + 10;
  const has0710 = scheduledTimes.includes('07:10');
  if (before0910 && has0710) return '07:10';
  return null;
}
