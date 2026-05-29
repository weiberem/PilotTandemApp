import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatChf(n: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDateDe(d: Date | string, opts: Intl.DateTimeFormatOptions = {
  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
}): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('de-CH', opts).format(date);
}

export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns a Date whose `getFullYear/getMonth/getDate/getHours/getMinutes`
 * give the wall-clock values in Europe/Zurich, regardless of the runtime's
 * actual time zone (Vercel runs in UTC). Use this whenever you need
 * "what does the pilot's watch say right now".
 */
export function nowInZurich(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return new Date(
    get('year'), get('month') - 1, get('day'),
    get('hour'), get('minute'), get('second'),
  );
}

/** Today's date as YYYY-MM-DD in Europe/Zurich. */
export function isoDateZurich(now: Date = new Date()): string {
  return isoDate(nowInZurich(now));
}

export function monthStart(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Accept either a bare Google Drive ID or any of the common URL forms and
 * return the ID. Returns the input trimmed if nothing matches.
 */
export function extractDriveId(input: string): string {
  const v = input.trim();
  if (!v) return v;
  // /folders/<id> or /file/d/<id> or open?id=<id>
  const m =
    v.match(/\/folders\/([a-zA-Z0-9_-]{20,})/)
    ?? v.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
    ?? v.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : v;
}
