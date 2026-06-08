'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type PilotPatch = Partial<{
  full_name: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  iban: string;
  vat_number: string;
  primary_company_name: string;
  primary_company_address: string;
  office_email: string;
  personal_email: string;
  invoice_cc_email: string;
  flight_rate_chf: number;
  photo_prepaid_rate_chf: number;
  thermal_rate_chf: number;
  no_show_rate_chf: number;
}>;

export async function saveOnboardingStep(
  patch: PilotPatch,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const cleaned: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    cleaned[key] = value;
  }
  if (Object.keys(cleaned).length === 0) return { ok: true };

  const { error } = await sb.from('pilots').update(cleaned).eq('id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/onboarding');
  revalidatePath('/settings');
  return { ok: true };
}
