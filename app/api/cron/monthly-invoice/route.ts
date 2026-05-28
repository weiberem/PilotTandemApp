import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildInvoiceRows, monthLabelDe } from '@/lib/invoice';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import { getResend, getFromAddress } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Runs on the 1st of each month at 07:00 CET (configured in vercel.json).
 * For every active pilot:
 *   - looks at the previous calendar month
 *   - if there are flights in that month, upserts a draft invoice row
 *     per company (excluding companies that already have status='sent')
 *   - emails the pilot to review/send via the dashboard
 *
 * Secured with CRON_SECRET (header or query param).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron not configured' }, { status: 500 });

  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url).searchParams.get('secret') ?? '';
  if (provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const svc = createServiceClient();

  // Previous month boundaries.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const monthFirst = isoDate(monthStart);
  const monthLast = isoDate(monthEnd);
  const monthLabel = monthLabelDe(monthFirst);

  const { data: pilots, error: perr } = await svc
    .from('pilots')
    .select('id, full_name, office_email, personal_email, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf, primary_company_name, is_active')
    .eq('is_active', true);
  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  const summary: Array<{ pilot_id: string; companies: { company: string; status: string; total: number }[]; emailed: boolean }> = [];

  for (const pilot of pilots ?? []) {
    const { data: flightRows } = await svc
      .from('flights')
      .select('*')
      .eq('pilot_id', pilot.id)
      .gte('flight_date', monthFirst)
      .lte('flight_date', monthLast);
    const flights = (flightRows ?? []) as FlightRow[];
    if (flights.length === 0) {
      summary.push({ pilot_id: pilot.id, companies: [], emailed: false });
      continue;
    }

    const rates: PilotRates = {
      flight_rate_chf: Number(pilot.flight_rate_chf ?? 105),
      photo_prepaid_rate_chf: Number(pilot.photo_prepaid_rate_chf ?? 40),
      thermal_rate_chf: Number(pilot.thermal_rate_chf ?? 50),
      no_show_rate_chf: Number(pilot.no_show_rate_chf ?? 32),
    };
    const byCompany = new Map<string, FlightRow[]>();
    for (const f of flights) {
      const list = byCompany.get(f.company) ?? [];
      list.push(f);
      byCompany.set(f.company, list);
    }

    const companyResults: { company: string; status: string; total: number }[] = [];
    for (const [company, list] of byCompany.entries()) {
      // Skip if an invoice for this month+company is already sent.
      const { data: existing } = await svc
        .from('invoices')
        .select('status, total_chf')
        .eq('pilot_id', pilot.id)
        .eq('month', monthFirst)
        .eq('company', company)
        .maybeSingle();
      if (existing?.status === 'sent') {
        companyResults.push({ company, status: 'already_sent', total: Number(existing.total_chf ?? 0) });
        continue;
      }
      const totals = computeDayTotals(list, rates);
      const { totals: invTotals } = buildInvoiceRows(list, rates, monthFirst);
      void totals; // both totals agree
      const { error: upErr } = await svc.from('invoices').upsert({
        pilot_id: pilot.id,
        month: monthFirst,
        company,
        status: 'draft',
        total_chf: invTotals.amount,
        flights_count: invTotals.flights,
        pp_count: invTotals.pp,
        thermal_count: invTotals.thermal,
        no_show_count: invTotals.noShow,
      }, { onConflict: 'pilot_id,month,company' });
      companyResults.push({
        company,
        status: upErr ? `error:${upErr.message}` : 'draft_ready',
        total: invTotals.amount,
      });
    }

    // Notify the pilot if any drafts were prepared and they have an email.
    const targetEmail = pilot.personal_email ?? pilot.office_email;
    const draftCount = companyResults.filter(c => c.status === 'draft_ready').length;
    let emailed = false;
    if (draftCount > 0 && targetEmail) {
      try {
        await getResend().emails.send({
          from: getFromAddress(),
          to: targetEmail,
          subject: `Ihre Rechnung für ${monthLabel} ist bereit zur Kontrolle.`,
          text: [
            `Hallo ${pilot.full_name ?? ''},`,
            ``,
            `Ihre Abrechnung für ${monthLabel} wurde automatisch erstellt.`,
            ``,
            ...companyResults
              .filter(c => c.status === 'draft_ready')
              .map(c => `  ${c.company}: CHF ${c.total.toFixed(0)}`),
            ``,
            `Bitte kontrollieren und im Dashboard senden:`,
            `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/invoice?month=${monthFirst}`,
            ``,
            `TandemLog`,
          ].join('\n'),
        });
        emailed = true;
      } catch (e) {
        console.warn('Cron notification email failed for', pilot.id, e);
      }
    }
    summary.push({ pilot_id: pilot.id, companies: companyResults, emailed });
  }

  return NextResponse.json({ ok: true, month: monthFirst, pilots: summary });
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
