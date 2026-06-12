import type { SupabaseClient } from '@supabase/supabase-js';
import { buildInvoiceRows, monthLabelDe } from './invoice';
import type { FlightRow, PilotRates } from './flights';
import { generateInvoiceXlsx } from './invoiceGenerator';
import { generateInvoicePdf } from './pdfGenerator';
import { reserveNextInvoiceNumber } from './invoiceNumber';
import { findOrCreatePath, refreshAccessToken, uploadToDriveFolder } from './googleDrive';
import { getResend, getFromAddress } from './email';

const VAT_DEFAULT = 0.081;

export type ServiceSendResult =
  | { ok: true; invoice_number: string; drive_uploaded: boolean }
  | { ok: false; error: string };

/**
 * Service-role invoice send for the cron auto-send path. Mirrors the manual
 * POST /api/invoice/send flow but loads everything through the service
 * client for an arbitrary pilot id.
 *
 * Callers are responsible for the safety checks (pilot opted in via
 * auto_send_invoice, all days verified, invoice not already sent).
 */
export async function sendInvoiceForPilot(
  svc: SupabaseClient,
  pilotId: string,
  monthFirst: string,
  company: string,
): Promise<ServiceSendResult> {
  const { data: pilot, error: perr } = await svc
    .from('pilots').select('*').eq('id', pilotId).maybeSingle();
  if (perr || !pilot) return { ok: false, error: perr?.message ?? 'pilot_not_found' };
  if (pilot.is_demo) return { ok: false, error: 'demo_pilot' };
  if (!pilot.office_email) return { ok: false, error: 'office_email_missing' };

  const [y, m] = monthFirst.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthLast = `${monthFirst.slice(0, 8)}${String(last).padStart(2, '0')}`;

  const { data: flightRows, error: ferr } = await svc
    .from('flights').select('*')
    .eq('pilot_id', pilotId).eq('company', company)
    .gte('flight_date', monthFirst).lte('flight_date', monthLast)
    .order('flight_date').order('trip_time');
  if (ferr) return { ok: false, error: ferr.message };
  const flights = (flightRows ?? []) as FlightRow[];
  if (flights.length === 0) return { ok: false, error: 'no_flights' };

  const rates: PilotRates = {
    flight_rate_chf: Number(pilot.flight_rate_chf ?? 105),
    photo_prepaid_rate_chf: Number(pilot.photo_prepaid_rate_chf ?? 40),
    thermal_rate_chf: Number(pilot.thermal_rate_chf ?? 50),
    no_show_rate_chf: Number(pilot.no_show_rate_chf ?? 32),
  };
  const { rows, totals } = buildInvoiceRows(flights, rates, monthFirst);
  if (totals.amount <= 0) return { ok: false, error: 'nothing_to_invoice' };

  const invoiceNumber = await reserveNextInvoiceNumber(pilotId, Number(monthFirst.slice(0, 4)));
  const today = new Date().toISOString().slice(0, 10);

  const docArgs = {
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
    invoiceNumber,
    invoiceDate: today,
    rows,
    totals,
  };

  const [pdfBuf, xlsxBuf] = await Promise.all([
    generateInvoicePdf(docArgs),
    generateInvoiceXlsx(docArgs),
  ]);

  // Drive upload — best effort.
  const baseName = `Rechnung_${monthFirst.slice(0, 7).replace('-', '_')}_${company.replace(/\s+/g, '_')}`;
  let pdfUrl: string | null = null;
  let xlsxUrl: string | null = null;
  if (pilot.google_drive_folder_id && pilot.google_refresh_token) {
    try {
      const tokens = await refreshAccessToken(pilot.google_refresh_token);
      const targetFolderId = await findOrCreatePath(
        pilot.google_drive_folder_id,
        [monthFirst.slice(0, 4), monthFirst.slice(5, 7)],
        tokens.access_token,
      );
      const [pdfUp, xlsxUp] = await Promise.all([
        uploadToDriveFolder({
          accessToken: tokens.access_token, folderId: targetFolderId,
          name: `${baseName}.pdf`, mimeType: 'application/pdf',
          body: pdfBuf.buffer.slice(pdfBuf.byteOffset, pdfBuf.byteOffset + pdfBuf.byteLength) as ArrayBuffer,
        }),
        uploadToDriveFolder({
          accessToken: tokens.access_token, folderId: targetFolderId,
          name: `${baseName}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength) as ArrayBuffer,
        }),
      ]);
      pdfUrl = pdfUp.webViewLink ?? null;
      xlsxUrl = xlsxUp.webViewLink ?? null;
    } catch (e) {
      console.warn('Auto-send: GDrive upload failed for', pilotId, e);
    }
  }

  const monthName = monthLabelDe(monthFirst);
  const cc = [pilot.personal_email, pilot.invoice_cc_email].filter((s): s is string => !!s);
  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to: pilot.office_email,
      cc: cc.length ? cc : undefined,
      subject: `Rechnung ${monthName} — ${pilot.full_name}`,
      text: [
        `Sehr geehrte Damen und Herren`,
        ``,
        `Anbei meine Abrechnung für ${monthName}:`,
        ``,
        `  Flüge:    ${totals.flights}`,
        `  Foto PP:  ${totals.pp}`,
        `  Thermal:  ${totals.thermal}`,
        `  No-Show:  ${totals.noShow}`,
        `  Total:    CHF ${totals.amount.toFixed(0)}`,
        ``,
        `Rechnungs-Nr.: ${invoiceNumber}`,
        ``,
        `Freundliche Grüsse`,
        pilot.full_name,
      ].join('\n'),
      attachments: [
        { filename: `${baseName}.pdf`,  content: pdfBuf  },
        { filename: `${baseName}.xlsx`, content: xlsxBuf },
      ],
    });
  } catch (e) {
    return { ok: false, error: `email_send_failed: ${String(e)}` };
  }

  const { error: upErr } = await svc.from('invoices').upsert({
    pilot_id: pilotId,
    month: monthFirst,
    company,
    invoice_number: invoiceNumber,
    status: 'sent',
    total_chf: totals.amount,
    flights_count: totals.flights,
    pp_count: totals.pp,
    thermal_count: totals.thermal,
    no_show_count: totals.noShow,
    pdf_url: pdfUrl,
    xlsx_url: xlsxUrl,
    sent_at: new Date().toISOString(),
  }, { onConflict: 'pilot_id,month,company' });
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, invoice_number: invoiceNumber, drive_uploaded: !!pdfUrl };
}

/**
 * Verification status of a month computed with the service client.
 * Returns null on query error (e.g. table missing).
 */
export async function monthVerificationStatusSvc(
  svc: SupabaseClient,
  pilotId: string,
  monthFirst: string,
): Promise<{ total: number; verified: number; allVerified: boolean } | null> {
  const [y, m] = monthFirst.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthLast = `${monthFirst.slice(0, 8)}${String(last).padStart(2, '0')}`;

  const [fRes, vRes] = await Promise.all([
    svc.from('flights').select('flight_date')
      .eq('pilot_id', pilotId).gte('flight_date', monthFirst).lte('flight_date', monthLast),
    svc.from('day_verifications').select('flight_date')
      .eq('pilot_id', pilotId).gte('flight_date', monthFirst).lte('flight_date', monthLast),
  ]);
  if (fRes.error || vRes.error) return null;

  const flightDates = new Set((fRes.data ?? []).map(r => r.flight_date as string));
  const verifiedDates = new Set((vRes.data ?? []).map(r => r.flight_date as string));
  const verified = [...flightDates].filter(d => verifiedDates.has(d)).length;
  return {
    total: flightDates.size,
    verified,
    allVerified: flightDates.size > 0 && verified === flightDates.size,
  };
}
