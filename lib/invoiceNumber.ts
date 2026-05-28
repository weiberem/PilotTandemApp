import { createServiceClient } from './supabase/server';
import { formatInvoiceNumber } from './invoice';

/**
 * Atomically increments the per-pilot, per-year invoice counter and returns
 * the next formatted invoice number ("YYYY-NNN"). Uses the service-role
 * client so we can read+write the pilots row in a single round trip,
 * bypassing the user-scoped RLS update path.
 */
export async function reserveNextInvoiceNumber(pilotId: string, year: number): Promise<string> {
  const sb = createServiceClient();
  const { data: pilot, error } = await sb
    .from('pilots')
    .select('invoice_counter, invoice_counter_year')
    .eq('id', pilotId)
    .single();
  if (error) throw new Error(`invoice counter read failed: ${error.message}`);

  const sameYear = pilot.invoice_counter_year === year;
  const next = (sameYear ? (pilot.invoice_counter ?? 0) : 0) + 1;

  const { error: upErr } = await sb
    .from('pilots')
    .update({ invoice_counter: next, invoice_counter_year: year })
    .eq('id', pilotId);
  if (upErr) throw new Error(`invoice counter write failed: ${upErr.message}`);

  return formatInvoiceNumber(year, next);
}
