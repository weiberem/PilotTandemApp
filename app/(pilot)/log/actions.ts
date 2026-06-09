'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { flightInputSchema, PHOTO_STATUSES, type FlightInput, type PhotoStatus } from '@/lib/flights';

export type FlightActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function mapInsertError(message: string, tripTime: string): string {
  if (/flights_pilot_date_time_unique|duplicate key/i.test(message)) {
    return `A flight at ${tripTime} is already logged for this day. Only one flight per trip time per pilot is allowed.`;
  }
  return message;
}

export async function createFlight(input: FlightInput): Promise<FlightActionResult> {
  const parsed = flightInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  // Each pilot may have only one flight per (date, trip_time). Pre-check
  // so the migration 008 constraint isn't strictly required for correctness.
  const { data: existing } = await supabase
    .from('flights').select('id')
    .eq('pilot_id', user.id)
    .eq('flight_date', parsed.data.flight_date)
    .eq('trip_time', parsed.data.trip_time)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: mapInsertError('duplicate key', parsed.data.trip_time) };
  }

  const { data, error } = await supabase
    .from('flights')
    .insert({ ...parsed.data, pilot_id: user.id })
    .select('id')
    .single();

  if (error) return { ok: false, error: mapInsertError(error.message, parsed.data.trip_time) };

  revalidatePath('/');
  revalidatePath('/today');
  revalidatePath('/summary');
  revalidatePath('/log');
  return { ok: true, id: data.id };
}

export async function updateFlight(id: string, input: FlightInput): Promise<FlightActionResult> {
  const parsed = flightInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  // Pre-check duplicate (excluding the row we're editing).
  const { data: clash } = await supabase
    .from('flights').select('id')
    .eq('pilot_id', user.id)
    .eq('flight_date', parsed.data.flight_date)
    .eq('trip_time', parsed.data.trip_time)
    .neq('id', id)
    .maybeSingle();
  if (clash) {
    return { ok: false, error: mapInsertError('duplicate key', parsed.data.trip_time) };
  }

  const { error } = await supabase
    .from('flights')
    .update(parsed.data)
    .eq('id', id)
    .eq('pilot_id', user.id);

  if (error) return { ok: false, error: mapInsertError(error.message, parsed.data.trip_time) };

  revalidatePath('/');
  revalidatePath('/today');
  revalidatePath('/summary');
  return { ok: true, id };
}

export async function deleteFlight(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase.from('flights').delete().eq('id', id).eq('pilot_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/today');
  revalidatePath('/summary');
  return { ok: true };
}

export async function deleteFlightAndGoHome(id: string) {
  await deleteFlight(id);
  redirect('/today');
}

export async function setFlightPhotoStatus(
  id: string, status: PhotoStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!PHOTO_STATUSES.includes(status)) return { ok: false, error: 'Invalid status' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: row, error: readErr } = await supabase
    .from('flights').select('is_no_show').eq('id', id).eq('pilot_id', user.id).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: 'Flight not found' };
  if (row.is_no_show && status !== 'none') {
    return { ok: false, error: 'No-show cannot have a photo' };
  }

  const { error } = await supabase
    .from('flights').update({ photo_status: status }).eq('id', id).eq('pilot_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/flights');
  revalidatePath('/summary');
  return { ok: true };
}
