'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { flightInputSchema, type FlightInput } from '@/lib/flights';

export type FlightActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createFlight(input: FlightInput): Promise<FlightActionResult> {
  const parsed = flightInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('flights')
    .insert({ ...parsed.data, pilot_id: user.id })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

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

  const { error } = await supabase
    .from('flights')
    .update(parsed.data)
    .eq('id', id)
    .eq('pilot_id', user.id);

  if (error) return { ok: false, error: error.message };

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
