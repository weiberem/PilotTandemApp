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
  vat_registered: boolean;
  pilot_type: 'skywings' | 'independent';
  primary_company_name: string;
  primary_company_address: string;
  office_email: string;
  personal_email: string;
  invoice_cc_email: string;
  flight_rate_chf: number;
  photo_prepaid_rate_chf: number;
  thermal_rate_chf: number;
  no_show_rate_chf: number;
  default_exclude_7am: boolean;
  default_exclude_5pm: boolean;
}>;

export async function saveOnboardingStep(
  patch: PilotPatch,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    cleaned[key] = value;
  }
  if (Object.keys(cleaned).length === 0) return { ok: true };

  // Resilience: if a column referenced here hasn't been added to the database
  // yet (a migration wasn't run — e.g. pilot_type), PostgREST returns
  // "Could not find the 'X' column of 'pilots' in the schema cache". Rather
  // than hard-failing onboarding, drop that column and retry. Newer optional
  // fields simply won't be saved until the migration runs, but registration
  // completes. Bounded loop so we never spin.
  let attempt = cleaned;
  for (let i = 0; i < Object.keys(cleaned).length + 1; i++) {
    if (Object.keys(attempt).length === 0) break;
    const { error } = await sb.from('pilots').update(attempt).eq('id', user.id);
    if (!error) {
      revalidatePath('/onboarding');
      revalidatePath('/settings');
      return { ok: true };
    }
    const missing = missingColumnFromError(error.message);
    if (!missing || !(missing in attempt)) {
      return { ok: false, error: error.message };
    }
    const { [missing]: _drop, ...rest } = attempt;
    attempt = rest;
  }

  revalidatePath('/onboarding');
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Extracts the column name from a PostgREST "schema cache" error such as:
 *   Could not find the 'pilot_type' column of 'pilots' in the schema cache
 * Returns null if the message isn't of that shape.
 */
function missingColumnFromError(message: string): string | null {
  const m = /Could not find the '([^']+)' column/.exec(message);
  return m ? m[1] : null;
}
