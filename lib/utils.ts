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
