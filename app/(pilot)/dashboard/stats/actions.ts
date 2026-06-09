'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function setVkpiReported(
  year: number, reported: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: 'Invalid year' };
  }
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { data: row, error: readErr } = await sb
    .from('pilots').select('vkpi_reported_years').eq('id', user.id).maybeSingle();
  if (readErr) {
    if (/column .*vkpi_reported_years/i.test(readErr.message)) {
      return { ok: false, error: 'Migration 007 missing — please run supabase/migrations/007_vkpi_reported_years.sql' };
    }
    return { ok: false, error: readErr.message };
  }

  const current = new Set<number>(Array.isArray(row?.vkpi_reported_years) ? (row!.vkpi_reported_years as number[]) : []);
  if (reported) current.add(year); else current.delete(year);

  const { error } = await sb
    .from('pilots').update({ vkpi_reported_years: [...current].sort() }).eq('id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/stats');
  return { ok: true };
}
