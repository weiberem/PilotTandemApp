export type DayPeriod = 'full' | 'half_am' | 'half_pm';

export type AvailabilityDay = {
  date: string;            // YYYY-MM-DD
  period: DayPeriod;
  exclude_7am?: boolean;   // summer only
  exclude_5pm?: boolean;   // summer only
};

export type AvailabilitySubmission = {
  id: string;
  pilot_id: string;
  month: string;           // YYYY-MM-01
  submitted_at: string | null;
  email_sent: boolean;
  days: AvailabilityDay[];
};

export function monthFirst(year: number, monthIndex0: number): string {
  const m = String(monthIndex0 + 1).padStart(2, '0');
  return `${year}-${m}-01`;
}

export function addMonths(year: number, monthIndex0: number, delta: number): { year: number; monthIndex0: number } {
  const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
  return { year: d.getUTCFullYear(), monthIndex0: d.getUTCMonth() };
}

export function monthGrid(year: number, monthIndex0: number): Array<{ date: string; inMonth: boolean }> {
  // Week starts Monday (Swiss/CH).
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  const startWeekday = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const cells: Array<{ date: string; inMonth: boolean }> = [];
  // Leading days from previous month
  for (let i = startWeekday; i > 0; i--) {
    const d = new Date(Date.UTC(year, monthIndex0, 1 - i));
    cells.push({ date: isoUtc(d), inMonth: false });
  }
  for (let day = 1; day <= last.getUTCDate(); day++) {
    cells.push({ date: isoUtc(new Date(Date.UTC(year, monthIndex0, day))), inMonth: true });
  }
  // Trailing days to fill the last week
  while (cells.length % 7 !== 0) {
    const offset = cells.length - (startWeekday + last.getUTCDate());
    cells.push({ date: isoUtc(new Date(Date.UTC(year, monthIndex0 + 1, 1 + offset))), inMonth: false });
  }
  return cells;
}

function isoUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function monthLabel(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

const PERIOD_LABEL: Record<DayPeriod, string> = {
  full: 'Ganztag',
  half_am: 'Halbtag Vormittag',
  half_pm: 'Halbtag Nachmittag',
};

export function periodLabel(p: DayPeriod): string { return PERIOD_LABEL[p]; }

export function dayMailtoLine(day: AvailabilityDay): string {
  const [, m, d] = day.date.split('-');
  const exclusions: string[] = [];
  if (day.exclude_7am) exclusions.push('kein 07:10');
  if (day.exclude_5pm) exclusions.push('kein 17:00');
  const tail = exclusions.length ? ` (${exclusions.join(', ')})` : '';
  return `${d}.${m}. ${PERIOD_LABEL[day.period]}${tail}`;
}

export function buildMailto({
  to, pilotName, year, monthIndex0, days,
}: {
  to: string;
  pilotName: string;
  year: number;
  monthIndex0: number;
  days: AvailabilityDay[];
}): string {
  const monthName = monthLabel(year, monthIndex0);
  const subject = `Verfügbarkeit ${monthName} — ${pilotName}`;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const body = [
    `Verfügbarkeit ${monthName} — ${pilotName}`,
    '',
    ...sorted.map(dayMailtoLine),
  ].join('\n');
  const q = new URLSearchParams({ subject, body });
  // mailto-encoded spaces should be %20, not "+"
  const qs = q.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(to)}?${qs}`;
}
