'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { deriveCcTripTimes } from '@/lib/sumup';
import { resolveSeason, SUMMER_TRIP_TIMES, WINTER_TRIP_TIMES } from '@/lib/tripTimes';
import type { ParsedSchedule } from '@/lib/einsatzplanParser';

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

const countSchema = z.object({
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  flights_count: z.number().int().min(1).max(30),
  photo_pp_count: z.number().int().min(0),
  double_air_count: z.number().int().min(0),
  no_show_count: z.number().int().min(0),
  company: z.string().min(1),
});

/**
 * Counts-summary capture (Tagesabrechnung): the daysheet has no departure
 * times, only per-pilot totals. Create `flights_count` flight rows for the day
 * WITHOUT times (no invented clock times) — times can be filled in later
 * (manually, or derived from a SumUp upload). No-shows take their own rows
 * (they can't carry photo/thermal); the remaining rows are tagged with PP photo
 * and double-airtime up to their counts (these may overlap on the same flight).
 *
 * Re-running replaces the day's previous timeless count rows (so re-uploading
 * the sheet doesn't pile up duplicates); manually-timed flights are untouched.
 */
export async function bulkAddFlightsByCount(input: z.input<typeof countSchema>) {
  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { flight_date, flights_count, photo_pp_count, double_air_count, no_show_count, company } = parsed.data;

  if (no_show_count > flights_count) return { ok: false as const, error: 'More no-shows than flights' };
  const flying = flights_count - no_show_count;
  if (photo_pp_count > flying) return { ok: false as const, error: 'More photos than flying flights' };
  if (double_air_count > flying) return { ok: false as const, error: 'More double-air than flying flights' };

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  // Replace any prior timeless count rows for this day (keeps re-uploads clean);
  // manually-timed flights (trip_time set) are left alone.
  await sb.from('flights')
    .delete()
    .eq('pilot_id', user.id)
    .eq('flight_date', flight_date)
    .is('trip_time', null);

  const rows = Array.from({ length: flights_count }, (_, i) => {
    const isNoShow = i < no_show_count;
    const fi = i - no_show_count; // index among flying rows
    return {
      pilot_id: user.id,
      flight_date,
      trip_time: null,
      company,
      photo_status: !isNoShow && fi < photo_pp_count ? 'PP' : 'none',
      is_no_show: isNoShow,
      // Fill double-air from the end so it doesn't always coincide with photos.
      is_double_airtime: !isNoShow && fi >= flying - double_air_count,
      tip_chf: 0,
    };
  });

  const { error } = await sb.from('flights').insert(rows);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/home');
  revalidatePath('/today');
  revalidatePath('/flights');
  return { ok: true as const, inserted: rows.length };
}

const sumupSchema = z.object({
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(40),
});

/**
 * SumUp CC matching: each 40-CHF card payment is a photo paid after a flight.
 * Derive the flight's trip time (payment ≈ flight + ~1h), then stamp that time
 * + photo_status 'CC' onto one of the day's timeless flights. Candidate trip
 * times come from the imported schedule for the day, else the season grid.
 */
export async function applySumupCcTimes(input: z.input<typeof sumupSchema>) {
  const parsed = sumupSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { flight_date, payment_times } = parsed.data;

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const { data: pilot } = await sb
    .from('pilots')
    .select('season_override, einsatzplan_schedule')
    .eq('id', user.id)
    .maybeSingle();

  const schedule = (pilot?.einsatzplan_schedule as ParsedSchedule | null) ?? {};
  const season = resolveSeason(pilot?.season_override ?? null, new Date(flight_date));
  const seasonTimes = season === 'summer' ? [...SUMMER_TRIP_TIMES] : [...WINTER_TRIP_TIMES];
  const candidates = schedule[flight_date]?.times?.length ? schedule[flight_date].times : seasonTimes;

  // Timeless flights for the day that can take a CC photo (not no-show, no
  // other photo already). 'none' first so we don't overwrite prepaid photos.
  const { data: rows } = await sb
    .from('flights')
    .select('id, photo_status, trip_time, is_no_show')
    .eq('pilot_id', user.id)
    .eq('flight_date', flight_date);
  const existingTimes = new Set((rows ?? []).map(r => r.trip_time).filter(Boolean) as string[]);
  const free = (rows ?? [])
    .filter(r => r.trip_time === null && !r.is_no_show)
    .sort((a, b) => (a.photo_status === 'none' ? 0 : 1) - (b.photo_status === 'none' ? 0 : 1));

  const matches = deriveCcTripTimes(payment_times, candidates)
    .map(m => m.trip)
    .filter((t): t is string => !!t && !existingTimes.has(t));
  // Distinct, ascending, and only as many as we have free flights.
  const trips = [...new Set(matches)].sort().slice(0, free.length);

  let assigned = 0;
  for (let i = 0; i < trips.length; i++) {
    const flight = free[i];
    const { error } = await sb.from('flights')
      .update({ trip_time: trips[i], photo_status: 'CC' })
      .eq('id', flight.id);
    if (!error) assigned++;
  }

  revalidatePath('/home');
  revalidatePath('/today');
  revalidatePath('/flights');
  return { ok: true as const, assigned, payments: payment_times.length };
}
