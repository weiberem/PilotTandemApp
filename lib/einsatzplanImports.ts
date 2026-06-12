import type { FullPlan, ParsedSchedule } from './einsatzplanParser';

/** One month's stored import. */
export type MonthlyImport = {
  drive_link: string;
  file_id: string;
  file_name: string | null;
  schedule: ParsedSchedule;
  full_plan: FullPlan | null;
  last_synced_at: string;   // ISO
  archived: boolean;
};

export type EinsatzplanImports = Record<string, MonthlyImport>;

/** YYYY-MM for a given date (Date or YYYY-MM-DD string). */
export function monthKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/** YYYY-MM for "now" and "next month". */
export function currentAndNextMonthKeys(now: Date = new Date()): { current: string; next: string } {
  const cur = monthKey(now);
  const n = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { current: cur, next: monthKey(n) };
}

/** Long English label for a YYYY-MM key. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Whether `key` is in the past (entire month already over). */
export function isPastMonth(key: string, now: Date = new Date()): boolean {
  return key < monthKey(now);
}

// Month-name tables for detecting a file's month from its name. German first
// (Skywings names files in German), English as a fallback. Value = 1..12.
const MONTH_NAMES: Record<string, number> = {
  januar: 1, 'jänner': 1, january: 1, jan: 1,
  februar: 2, february: 2, feb: 2,
  'märz': 3, maerz: 3, marz: 3, march: 3, mar: 3, mrz: 3,
  april: 4, apr: 4,
  mai: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  dezember: 12, december: 12, dez: 12, dec: 12,
};

/**
 * Best-effort detection of a "YYYY-MM" month key from an Einsatzplan file name,
 * e.g. "Einsatzplan Juli 2026.xlsx" → "2026-07", "Plan_2026-07.xlsx" → "2026-07".
 * Returns null when no unambiguous month+year is present.
 */
export function detectMonthFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();

  // Numeric forms: YYYY-MM / YYYY_MM / YYYY.MM  and  MM-YYYY / MM.YYYY / MM_YYYY
  const ymd = lower.match(/(20\d{2})[-_.](0[1-9]|1[0-2])(?!\d)/);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  const mdy = lower.match(/(?<!\d)(0[1-9]|1[0-2])[-_.](20\d{2})/);
  if (mdy) return `${mdy[2]}-${mdy[1]}`;

  // Named month + a 4-digit year somewhere in the name.
  const year = lower.match(/(20\d{2})/);
  if (!year) return null;
  for (const [word, m] of Object.entries(MONTH_NAMES)) {
    // Boundary match so "mar" doesn't fire inside "marathon".
    if (new RegExp(`(^|[^a-zäöü])${word}([^a-zäöü]|$)`).test(lower)) {
      return `${year[1]}-${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}
