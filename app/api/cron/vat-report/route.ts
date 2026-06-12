import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildVatReportXlsx, semesterRange, type VatHalf } from '@/lib/vatReport';
import type { FlightRow, PilotRates } from '@/lib/flights';
import { getResend, getFromAddress } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Half-yearly VAT report. Runs:
 *   - June 30 at 06:00 UTC  → H1 (Jan–Jun)
 *   - Dec  31 at 06:00 UTC  → H2 (Jul–Dec)
 *
 * For every active VAT-registered pilot, builds an Excel summarising the
 * semester's gross/VAT/net per month per company and emails it to the
 * personal address (falls back to office_email). Non-VAT pilots are
 * skipped. Override semester via ?half=H1|H2&year=YYYY for manual runs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron not configured' }, { status: 500 });
  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Override for manual runs / backfill; otherwise derive from today's date.
  const url = new URL(req.url);
  const overrideHalf = url.searchParams.get('half') as VatHalf | null;
  const overrideYear = url.searchParams.get('year');

  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1..12
  const year = overrideYear ? Number(overrideYear) : now.getUTCFullYear();
  const half: VatHalf = overrideHalf ?? (month <= 6 ? 'H1' : 'H2');
  const { start, end, label } = semesterRange(year, half);

  const svc = createServiceClient();
  const { data: pilots, error } = await svc
    .from('pilots')
    .select('id, full_name, personal_email, office_email, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf, is_active, is_demo, vat_registered')
    .eq('is_active', true)
    .eq('vat_registered', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ pilot_id: string; sent: boolean; reason?: string; totals?: unknown }> = [];

  for (const p of pilots ?? []) {
    if (p.is_demo) { results.push({ pilot_id: p.id, sent: false, reason: 'demo' }); continue; }
    const to = p.personal_email ?? p.office_email;
    if (!to) { results.push({ pilot_id: p.id, sent: false, reason: 'no_email' }); continue; }

    const { data: flightRows } = await svc.from('flights').select('*')
      .eq('pilot_id', p.id).gte('flight_date', start).lte('flight_date', end);
    const flights = (flightRows ?? []) as FlightRow[];
    if (flights.length === 0) {
      results.push({ pilot_id: p.id, sent: false, reason: 'no_flights' });
      continue;
    }
    const rates: PilotRates = {
      flight_rate_chf: Number(p.flight_rate_chf ?? 105),
      photo_prepaid_rate_chf: Number(p.photo_prepaid_rate_chf ?? 40),
      thermal_rate_chf: Number(p.thermal_rate_chf ?? 50),
      no_show_rate_chf: Number(p.no_show_rate_chf ?? 32),
    };

    let buffer: Buffer; let totals: { revenue: number; vat: number; net: number; flights: number };
    try {
      ({ buffer, totals } = await buildVatReportXlsx({
        flights, rates, year, half,
        pilotName: p.full_name ?? '',
        vatRegistered: true,
      }));
    } catch (e) {
      results.push({ pilot_id: p.id, sent: false, reason: `report_failed: ${(e as Error).message}` });
      continue;
    }

    try {
      await getResend().emails.send({
        from: getFromAddress(),
        to,
        subject: `VAT report ${label} — ready to file`,
        text: [
          `Hi ${p.full_name ?? ''},`,
          ``,
          `Semester ${label} is closed. Summary for your VAT filing:`,
          ``,
          `  Flights:       ${totals.flights}`,
          `  Gross revenue: CHF ${totals.revenue.toFixed(2)}`,
          `  VAT (8.1%):    CHF ${totals.vat.toFixed(2)}`,
          `  Net revenue:   CHF ${totals.net.toFixed(2)}`,
          ``,
          `Excel attached — forward to your accountant or upload to ESTV.`,
          ``,
          `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/stats`,
          ``,
          `TandemLog`,
        ].join('\n'),
        attachments: [{
          filename: `vat-report-${half}-${year}.xlsx`,
          content: buffer,
        }],
      });
      results.push({ pilot_id: p.id, sent: true, totals });
    } catch (e) {
      results.push({ pilot_id: p.id, sent: false, reason: `mail_failed: ${(e as Error).message}` });
    }
  }

  return NextResponse.json({ ok: true, half, year, label, processed: results });
}
