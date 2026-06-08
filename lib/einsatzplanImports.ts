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
