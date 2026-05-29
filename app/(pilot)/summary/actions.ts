'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { maybeSendMonthReadyMail } from '@/lib/dayVerify';

/** Mark a flight day as verified. */
export async function verifyDay(date: string): Promise<{ ok: boolean; error?: string; mail?: { sent: boolean; reason?: string } }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'invalid_date' };
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { error } = await sb
    .from('day_verifications')
    .upsert({ pilot_id: user.id, flight_date: date }, { onConflict: 'pilot_id,flight_date' });
  if (error) return { ok: false, error: error.message };

  // If this was the last unverified day of the month, fire the once-per-month mail.
  const monthFirst = `${date.slice(0, 7)}-01`;
  let mail: { sent: boolean; reason?: string } | undefined;
  try {
    mail = await maybeSendMonthReadyMail(user.id, monthFirst);
  } catch (e) {
    mail = { sent: false, reason: (e as Error).message };
  }

  revalidatePath('/summary');
  revalidatePath('/today');
  revalidatePath('/flights');
  revalidatePath('/dashboard/invoice');
  return { ok: true, mail };
}

/** Undo a verification (pilot wants to edit the day's flights again). */
export async function unverifyDay(date: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'invalid_date' };
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { error } = await sb
    .from('day_verifications')
    .delete()
    .eq('pilot_id', user.id)
    .eq('flight_date', date);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/summary');
  revalidatePath('/today');
  revalidatePath('/flights');
  revalidatePath('/dashboard/invoice');
  return { ok: true };
}
