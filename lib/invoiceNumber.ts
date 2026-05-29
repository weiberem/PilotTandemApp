import { createServiceClient } from './supabase/server';
import { formatInvoiceNumber } from './invoice';

/**
 * Atomically reserves the next per-pilot, per-year invoice number ("YYYY-NNN").
 *
 * Calls the Postgres `reserve_invoice_number` RPC which does the
 * increment in a single statement under a row lock, so concurrent
 * /api/invoice/send calls for the same pilot can never produce duplicate
 * numbers (Swiss bookkeeping requires unique sequential numbers).
 *
 * Uses the service-role client. IMPORTANT: callers must only ever pass the
 * authenticated user's own id (server-derived) — this bypasses RLS.
 */
export async function reserveNextInvoiceNumber(pilotId: string, year: number): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc('reserve_invoice_number', {
    p_pilot: pilotId,
    p_year: year,
  });
  if (error) throw new Error(`invoice counter reservation failed: ${error.message}`);
  const next = Number(data);
  if (!Number.isFinite(next) || next < 1) {
    throw new Error('invoice counter reservation returned an invalid value');
  }
  return formatInvoiceNumber(year, next);
}
