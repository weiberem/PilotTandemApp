import { createClient } from './supabase/server';
import type { FlightRow, PilotRates } from './flights';
import {
  buildInvoiceRows, type InvoiceCompanyInfo, type InvoiceDayRow, type InvoicePilotInfo,
  type InvoiceTotals,
} from './invoice';

export type AssembledInvoice = {
  pilotId: string;
  pilot: InvoicePilotInfo;
  company: InvoiceCompanyInfo;
  rates: PilotRates;
  monthFirst: string;        // YYYY-MM-01
  rows: InvoiceDayRow[];
  totals: InvoiceTotals;
  flights: FlightRow[];      // raw, for the comparison view
  driveFolderId: string | null;
  officeEmail: string | null;
  personalEmail: string | null;
  invoiceCcEmail: string | null;
};

const VAT_DEFAULT = 0.081;

/**
 * Load the pilot's profile and the month's flights for a given company,
 * then aggregate into invoice rows. Uses the authenticated server client
 * so RLS scopes everything to the current user.
 */
export async function assembleInvoice({
  monthFirst, company,
}: { monthFirst: string; company: string }): Promise<AssembledInvoice | { error: string }> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const { data: pilot, error: perr } = await sb
    .from('pilots')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (perr) return { error: perr.message };
  if (!pilot) return { error: 'pilot_not_found' };

  // Date range: full calendar month.
  const [y, m] = monthFirst.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthLast = `${monthFirst.slice(0, 8)}${String(last).padStart(2, '0')}`;

  const { data: flightsRows, error: ferr } = await sb
    .from('flights')
    .select('*')
    .eq('company', company)
    .gte('flight_date', monthFirst)
    .lte('flight_date', monthLast)
    .order('flight_date')
    .order('trip_time');
  if (ferr) return { error: ferr.message };

  const flights = (flightsRows ?? []) as FlightRow[];
  const rates: PilotRates = {
    flight_rate_chf: Number(pilot.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot.no_show_rate_chf ?? 32),
  };
  const { rows, totals } = buildInvoiceRows(flights, rates, monthFirst);

  return {
    pilotId: user.id,
    pilot: {
      full_name: pilot.full_name,
      address_line1: pilot.address_line1,
      address_line2: pilot.address_line2,
      postal_code: pilot.postal_code,
      city: pilot.city,
      iban: pilot.iban,
      vat_number: pilot.vat_number,
      vat_rate: Number(pilot.vat_rate ?? VAT_DEFAULT),
    },
    company: {
      name: company === pilot.primary_company_name || company === 'Skywings'
        ? (pilot.primary_company_name ?? 'Skywings Adventures GmbH')
        : company,
      address: company === pilot.primary_company_name || company === 'Skywings'
        ? (pilot.primary_company_address ?? null)
        : null,
    },
    rates,
    monthFirst,
    rows,
    totals,
    flights,
    driveFolderId: pilot.google_drive_folder_id ?? null,
    officeEmail: pilot.office_email ?? null,
    personalEmail: pilot.personal_email ?? null,
    invoiceCcEmail: pilot.invoice_cc_email ?? null,
  };
}
