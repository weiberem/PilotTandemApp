'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trip_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(20),
  pp_count: z.number().int().min(0),
  cc_count: z.number().int().min(0),
  cash_count: z.number().int().min(0),
  company: z.string().min(1),
});

/**
 * Confirmed AI screenshot capture: insert one flight per extracted trip time.
 * Photo statuses are assigned to the earliest flights in order PP → CC → C
 * (editable afterwards in Today's Flights). Duplicates on
 * (date, time) are skipped, never overwritten.
 */
export async function bulkAddFlights(input: z.input<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { flight_date, trip_times, pp_count, cc_count, cash_count, company } = parsed.data;

  if (pp_count + cc_count + cash_count > trip_times.length) {
    return { ok: false as const, error: 'More photo sales than flights' };
  }

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  // Skip times that already exist for this day.
  const { data: existing } = await sb
    .from('flights')
    .select('trip_time')
    .eq('pilot_id', user.id)
    .eq('flight_date', flight_date);
  const seen = new Set((existing ?? []).map(r => r.trip_time as string));

  const sorted = [...trip_times].sort();
  const photoQueue: Array<'PP' | 'CC' | 'C'> = [
    ...Array<'PP'>(pp_count).fill('PP'),
    ...Array<'CC'>(cc_count).fill('CC'),
    ...Array<'C'>(cash_count).fill('C'),
  ];

  const rows = sorted
    .filter(t => !seen.has(t))
    .map((t, i) => ({
      pilot_id: user.id,
      flight_date,
      trip_time: t,
      company,
      photo_status: photoQueue[i] ?? 'none',
      is_no_show: false,
      is_double_airtime: false,
      tip_chf: 0,
    }));

  if (rows.length === 0) {
    return { ok: false as const, error: 'All these flights are already logged' };
  }

  const { error } = await sb.from('flights').insert(rows);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/home');
  revalidatePath('/today');
  revalidatePath('/flights');
  return { ok: true as const, inserted: rows.length, skipped: sorted.length - rows.length };
}
