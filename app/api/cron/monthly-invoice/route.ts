import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildInvoiceRows, monthLabelDe } from '@/lib/invoice';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import { getResend, getFromAddress } from '@/lib/email';
import { runMonthlyBackup } from '@/lib/runBackup';
import { archivePreviousMonthImports } from '@/lib/archiveImports';
import { sendInvoiceForPilot, monthVerificationStatusSvc } from '@/lib/sendInvoiceService';

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

  // Header only — never accept the secret as a query param (it would land in
  // server/proxy access logs). Vercel Cron sends "authorization: Bearer <CRON_SECRET>".
  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
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
    .select('id, full_name, office_email, personal_email, flight_rate_chf, photo_prepaid_rate_chf, thermal_rate_chf, no_show_rate_chf, primary_company_name, is_active, auto_send_invoice, is_demo')
    .eq('is_active', true);
  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  const summary: Array<{
    pilot_id: string;
    companies: { company: string; status: string; total: number }[];
    emailed: boolean;
    verification?: { total: number; verified: number; allVerified: boolean } | null;
    auto_sent?: string[];
    backup?: { file_name?: string; deleted?: number; error?: string };
  }> = [];

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

    // Verification status decides both the email wording and auto-send.
    const verification = await monthVerificationStatusSvc(svc, pilot.id, monthFirst);
    const autoSent: string[] = [];

    if (verification?.allVerified && pilot.auto_send_invoice && !pilot.is_demo) {
      for (const c of companyResults) {
        if (c.status !== 'draft_ready') continue;
        const r = await sendInvoiceForPilot(svc, pilot.id, monthFirst, c.company);
        if (r.ok) {
          c.status = `auto_sent:${r.invoice_number}`;
          autoSent.push(c.company);
        } else {
          c.status = `auto_send_failed:${r.error}`;
        }
      }
    }

    // Notify the pilot if any drafts were prepared and they have an email.
    const targetEmail = pilot.personal_email ?? pilot.office_email;
    const draftCount = companyResults.filter(c => c.status === 'draft_ready').length;
    let emailed = false;
    if ((draftCount > 0 || autoSent.length > 0) && targetEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      let subject: string;
      let bodyLines: string[];

      if (autoSent.length > 0) {
        subject = `${monthLabel}: invoice sent automatically`;
        bodyLines = [
          `Hi ${pilot.full_name ?? ''},`,
          ``,
          `All flight days of ${monthLabel} were verified and auto-send is on,`,
          `so your invoice went out to the office automatically:`,
          ``,
          ...companyResults
            .filter(c => c.status.startsWith('auto_sent'))
            .map(c => `  ${c.company}: CHF ${c.total.toFixed(0)}`),
          ``,
          `Details: ${appUrl}/dashboard/invoice?month=${monthFirst}`,
        ];
      } else if (verification?.allVerified) {
        subject = `${monthLabel}: invoice ready — all days verified`;
        bodyLines = [
          `Hi ${pilot.full_name ?? ''},`,
          ``,
          `All ${verification.total} flight days of ${monthLabel} are verified.`,
          `Your invoice is ready — review and send it with one tap:`,
          ``,
          ...companyResults
            .filter(c => c.status === 'draft_ready')
            .map(c => `  ${c.company}: CHF ${c.total.toFixed(0)}`),
          ``,
          `${appUrl}/dashboard/invoice?month=${monthFirst}`,
          ``,
          `Tip: enable auto-send in Settings and this step disappears.`,
        ];
      } else {
        const open = verification ? verification.total - verification.verified : null;
        subject = `${monthLabel}: verify your days to send the invoice`;
        bodyLines = [
          `Hi ${pilot.full_name ?? ''},`,
          ``,
          open != null
            ? `${open} of ${verification!.total} flight days of ${monthLabel} still need verification.`
            : `Some flight days of ${monthLabel} still need verification.`,
          `Once all days are verified you can send the invoice:`,
          ``,
          ...companyResults
            .filter(c => c.status === 'draft_ready')
            .map(c => `  ${c.company}: CHF ${c.total.toFixed(0)} (draft)`),
          ``,
          `Verify days: ${appUrl}/flights`,
          `Invoice: ${appUrl}/dashboard/invoice?month=${monthFirst}`,
        ];
      }

      try {
        await getResend().emails.send({
          from: getFromAddress(),
          to: targetEmail,
          subject,
          text: [...bodyLines, ``, `TandemLog`].join('\n'),
        });
        emailed = true;
      } catch (e) {
        console.warn('Cron notification email failed for', pilot.id, e);
      }
    }
    // Monthly Excel backup: handmade-layout copy of the month's flights into
    // the pilot's root Drive folder. Keeps last 2 months, deletes older.
    let backup: { file_name?: string; deleted?: number; error?: string } | undefined;
    try {
      const r = await runMonthlyBackup(pilot.id, monthFirst);
      backup = r.ok
        ? { file_name: r.file_name, deleted: r.deleted.length }
        : { error: r.error };
    } catch (e) {
      backup = { error: e instanceof Error ? e.message : 'unknown' };
    }

    summary.push({ pilot_id: pilot.id, companies: companyResults, emailed, verification, auto_sent: autoSent, backup });
  }

  // Archive any per-month Einsatzplan imports whose month has fully ended.
  // The "previous month key" is the same monthFirst we just invoiced for.
  const prevMonthKey = monthFirst.slice(0, 7); // YYYY-MM
  let archived: Array<{ pilot_id: string; archived: number }> = [];
  try {
    archived = await archivePreviousMonthImports(prevMonthKey);
  } catch (e) {
    console.warn('archivePreviousMonthImports failed:', e);
  }

  return NextResponse.json({ ok: true, month: monthFirst, pilots: summary, archived });
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
