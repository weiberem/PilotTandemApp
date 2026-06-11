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

/** English "Month YYYY" — for UI. */
export function monthLabel(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** German "Monat YYYY" — for the office mailto. */
function monthLabelDe(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** English month name only (no year) — for UI. */
export function monthName(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(d);
}

export type DeadlineInfo = {
  deadlineDay: 15;
  deadlineMonthLabel: string;  // e.g. "Juni"
  targetMonthLabel: string;    // e.g. "Juli 2026"
  targetMonth: string;         // YYYY-MM-01 of the month being planned
  urgent: boolean;             // deadline within ~5 days
};

/**
 * Availability is submitted by the 15th of the month BEFORE the planned month.
 * From "now", work out the next actionable deadline + which month it plans:
 *   - today <= 15th → deadline is the 15th of THIS month, plans NEXT month
 *   - today >  15th → deadline is the 15th of NEXT month, plans the month after
 *
 * Example: on 29 May → "bis 15. Juni" plans "Juli".
 */
export function nextDeadlineInfo(now: Date = new Date()): DeadlineInfo {
  const day = now.getDate();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const deadline = day <= 15 ? { year: y, monthIndex0: m } : addMonths(y, m, 1);
  const target = addMonths(deadline.year, deadline.monthIndex0, 1);

  // Urgent if the deadline 15th is within 5 days from now.
  const deadlineDate = new Date(deadline.year, deadline.monthIndex0, 15);
  const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / 86_400_000);

  return {
    deadlineDay: 15,
    deadlineMonthLabel: monthName(deadline.year, deadline.monthIndex0),
    targetMonthLabel: monthLabel(target.year, target.monthIndex0),
    targetMonth: `${target.year}-${String(target.monthIndex0 + 1).padStart(2, '0')}-01`,
    urgent: daysLeft <= 5,
  };
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

/**
 * Inverted form: the pilot lists the days they are NOT available; everything
 * else counts as available full-day. Mirrors how some pilots prefer to plan.
 */
export function buildMailtoInverted({
  to, pilotName, year, monthIndex0, freeDates,
}: {
  to: string;
  pilotName: string;
  year: number;
  monthIndex0: number;
  freeDates: string[];   // YYYY-MM-DD, sorted or not
}): string {
  const monthNameDe = monthLabelDe(year, monthIndex0);
  const subject = `Verfügbarkeit ${monthNameDe} — ${pilotName}`;
  const sorted = [...freeDates].sort();
  const lines = sorted.map(d => {
    const [, m, dd] = d.split('-');
    return `${dd}.${m}.`;
  });
  const body = [
    `Verfügbarkeit ${monthNameDe} — ${pilotName}`,
    ``,
    `Ich bin den ganzen Monat verfügbar, AUSSER an folgenden Tagen:`,
    ...lines,
  ].join('\n');
  const q = new URLSearchParams({ subject, body });
  const qs = q.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(to)}?${qs}`;
}

/**
 * Build an ICS file (RFC 5545) with one all-day event per availability day,
 * importable into Google Calendar, Apple Calendar, Android and Outlook.
 */
export function buildAvailabilityIcs(days: AvailabilityDay[], pilotName: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const events = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => {
      const dateCompact = d.date.replace(/-/g, '');
      const next = new Date(d.date + 'T00:00:00Z');
      next.setUTCDate(next.getUTCDate() + 1);
      const endCompact = next.toISOString().slice(0, 10).replace(/-/g, '');
      const label = PERIOD_LABEL[d.period];
      const notes: string[] = [];
      if (d.exclude_7am) notes.push('kein 07:10');
      if (d.exclude_5pm) notes.push('kein 17:00');
      const summary = `Tandem ${label}${notes.length ? ` (${notes.join(', ')})` : ''}`;
      return [
        'BEGIN:VEVENT',
        `UID:tandemlog-${d.date}-${d.period}@tandemlog`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateCompact}`,
        `DTEND;VALUE=DATE:${endCompact}`,
        `SUMMARY:${summary}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      ].join('\r\n');
    });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//TandemLog//Availability//${pilotName}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
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
  const monthNameDe = monthLabelDe(year, monthIndex0);
  const subject = `Verfügbarkeit ${monthNameDe} — ${pilotName}`;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const body = [
    `Verfügbarkeit ${monthNameDe} — ${pilotName}`,
    '',
    ...sorted.map(dayMailtoLine),
  ].join('\n');
  const q = new URLSearchParams({ subject, body });
  // mailto-encoded spaces should be %20, not "+"
  const qs = q.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(to)}?${qs}`;
}
