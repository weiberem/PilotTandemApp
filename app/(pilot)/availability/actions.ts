'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(['full', 'half_am', 'half_pm']),
  exclude_7am: z.boolean().optional(),
  exclude_5pm: z.boolean().optional(),
});

const submissionSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  days: z.array(daySchema).max(31),
  mark_submitted: z.boolean().optional(),
});

export async function saveAvailability(input: z.input<typeof submissionSchema>) {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const { month, days, mark_submitted } = parsed.data;
  const submittedAt = mark_submitted ? new Date().toISOString() : null;

  const { error } = await supabase
    .from('availability_submissions')
    .upsert({
      pilot_id: user.id,
      month,
      days,
      ...(mark_submitted ? { submitted_at: submittedAt, email_sent: true } : {}),
    }, { onConflict: 'pilot_id,month' });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/availability');
  return { ok: true as const };
}

/**
 * Undo the "submitted" state for a month (e.g. the pilot prepared the email
 * but never actually sent it). Keeps the entered days.
 */
export async function resetSubmission(month: string) {
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false as const, error: 'Invalid month' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const { error } = await supabase
    .from('availability_submissions')
    .update({ submitted_at: null, email_sent: false })
    .eq('pilot_id', user.id)
    .eq('month', month);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/availability');
  return { ok: true as const };
}
