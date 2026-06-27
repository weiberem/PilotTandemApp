'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Set (or clear) the pilot's own season override.
 * 'auto' clears it so the pilot follows the office/admin season.
 */
export async function setSeasonOverride(value: 'auto' | 'summer' | 'winter') {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const { error } = await sb
    .from('pilots')
    .update({ season_override: value === 'auto' ? null : value })
    .eq('id', user.id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/home');
  revalidatePath('/settings');
  return { ok: true as const };
}
