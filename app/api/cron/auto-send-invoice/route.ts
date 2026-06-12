import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendInvoiceForPilot, monthVerificationStatusSvc } from '@/lib/sendInvoiceService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Runs daily on the 2nd–7th of the month at 07:00 CET to actually send the
 * invoices that were announced as "auto-send in 24h" by the day-1 cron.
 *
 * Only pilots with auto_send_invoice = true, status = 'draft' for the
 * previous month, and all days still verified are processed. A pilot who
 * turned the flag off after the announcement, sent manually, or unverified
 * a day in between is skipped.
 *
 * Secured with CRON_SECRET (same header convention as the other crons).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron not configured' }, { status: 500 });
  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const svc = createServiceClient();

  // Previous calendar month (same boundary the monthly cron uses on day 1).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthFirst = isoDate(monthStart);

  // Find drafts for the previous month, then load the pilots map separately.
  const { data: drafts, error } = await svc
    .from('invoices')
    .select('pilot_id, company, created_at')
    .eq('month', monthFirst)
    .eq('status', 'draft');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pilotIds = [...new Set((drafts ?? []).map(d => d.pilot_id as string))];
  const { data: pilots } = pilotIds.length > 0
    ? await svc.from('pilots').select('id, auto_send_invoice, is_active, is_demo').in('id', pilotIds)
    : { data: [] };
  const pilotMap = new Map((pilots ?? []).map(p => [p.id as string, p as { id: string; auto_send_invoice: boolean; is_active: boolean; is_demo: boolean }]));

  const out: Array<{ pilot_id: string; company: string; result: string }> = [];

  for (const row of drafts ?? []) {
    const pilot = pilotMap.get(row.pilot_id as string);
    if (!pilot || !pilot.is_active || pilot.is_demo || !pilot.auto_send_invoice) continue;

    // Require all days to (still) be verified.
    const v = await monthVerificationStatusSvc(svc, pilot.id, monthFirst);
    if (!v?.allVerified) {
      out.push({ pilot_id: pilot.id, company: row.company as string, result: 'skipped_not_all_verified' });
      continue;
    }

    // Safety: don't send within 20h of draft creation — gives the
    // pilot the promised "24h to intervene" window even when this
    // cron ticks at a slightly earlier minute.
    const draftAgeMs = Date.now() - new Date(row.created_at as string).getTime();
    if (draftAgeMs < 20 * 3600_000) {
      out.push({ pilot_id: pilot.id, company: row.company as string, result: 'skipped_too_fresh' });
      continue;
    }

    const r = await sendInvoiceForPilot(svc, pilot.id, monthFirst, row.company as string);
    out.push({
      pilot_id: pilot.id,
      company: row.company as string,
      result: r.ok ? `sent:${r.invoice_number}` : `failed:${r.error}`,
    });
  }

  return NextResponse.json({ ok: true, month: monthFirst, processed: out });
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
