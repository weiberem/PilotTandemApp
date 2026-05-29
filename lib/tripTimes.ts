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

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Smart pre-fill for the FIRST flight of the day, based on the wall clock.
 *
 * Rule (agreed with the pilot): a flight can only be logged ~50–60 min after
 * its published departure, so:
 *   - before 09:00 → the first scheduled time (07:10 if scheduled, else the
 *     earliest of the day)
 *   - from 09:00 on → the LATEST scheduled departure time whose published
 *     time is already in the past (≤ now). e.g. at 12:50 → 11:45, at 14:30 →
 *     13:30, at 11:16 → 10:30.
 *
 * `scheduledTimes` must be ascending (they are). Returns null only if the
 * list is empty.
 */
export function suggestCurrentTripTime(
  scheduledTimes: readonly string[],
  now: Date = new Date(),
): string | null {
  if (scheduledTimes.length === 0) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < 9 * 60) return scheduledTimes[0];

  let chosen = scheduledTimes[0];
  for (const t of scheduledTimes) {
    if (toMinutes(t) <= mins) chosen = t;
    else break;
  }
  return chosen;
}
