import { createClient, createServiceClient } from './supabase/server';
import { monthLabelDe } from './invoice';
import { getResend, getFromAddress } from './email';

export type DayVerificationStatus = {
  total: number;            // distinct flight days in the month
  verified: number;
  unverifiedDates: string[]; // YYYY-MM-DD list (sorted asc)
  ready: boolean;           // total > 0 && all verified
};

/**
 * Get the verification status for a month for the authenticated pilot.
 * Uses the request-scoped client (RLS).
 */
export async function getMonthVerificationStatus(
  pilotId: string,
  monthFirst: string,         // YYYY-MM-01
): Promise<DayVerificationStatus> {
  const sb = createClient();
  const [y, m] = monthFirst.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthLast = `${monthFirst.slice(0, 8)}${String(last).padStart(2, '0')}`;

  const [{ data: flightRows }, { data: verRows }] = await Promise.all([
    sb.from('flights').select('flight_date')
      .eq('pilot_id', pilotId)
      .gte('flight_date', monthFirst).lte('flight_date', monthLast),
    sb.from('day_verifications').select('flight_date')
      .eq('pilot_id', pilotId)
      .gte('flight_date', monthFirst).lte('flight_date', monthLast),
  ]);

  const flightDates = new Set<string>((flightRows ?? []).map(r => r.flight_date as string));
  const verifiedDates = new Set<string>((verRows ?? []).map(r => r.flight_date as string));
  const total = flightDates.size;
  const verified = [...flightDates].filter(d => verifiedDates.has(d)).length;
  const unverifiedDates = [...flightDates].filter(d => !verifiedDates.has(d)).sort();
  return {
    total, verified, unverifiedDates,
    ready: total > 0 && verified === total,
  };
}

/**
 * If the month just became fully verified and we haven't emailed yet,
 * send the "ready to bill" notification and record it.
 *
 * Uses the service-role client so the write to monthly_ready_emails works
 * even though that table is RLS-scoped to read-only for the pilot.
 */
export async function maybeSendMonthReadyMail(
  pilotId: string,
  monthFirst: string,
): Promise<{ sent: boolean; reason?: string }> {
  const status = await getMonthVerificationStatus(pilotId, monthFirst);
  if (!status.ready) return { sent: false, reason: 'not_ready' };

  const svc = createServiceClient();
  // Try to claim the "we sent this month" row atomically. If it already
  // exists (unique violation), we skip — pilot already got the mail.
  const { error: insErr } = await svc.from('monthly_ready_emails').insert({
    pilot_id: pilotId,
    month: monthFirst,
  });
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message)) return { sent: false, reason: 'already_sent' };
    return { sent: false, reason: insErr.message };
  }

  const { data: pilot } = await svc
    .from('pilots')
    .select('full_name, personal_email, office_email')
    .eq('id', pilotId)
    .maybeSingle();
  const to = pilot?.personal_email ?? pilot?.office_email;
  if (!to) return { sent: false, reason: 'no_recipient' };

  const label = monthLabelDe(monthFirst);
  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to,
      subject: `${label}: Abrechnung bereit zur Kontrolle`,
      text: [
        `Hallo ${pilot?.full_name ?? ''},`,
        ``,
        `Du hast für ${label} alle ${status.total} Flugtage verifiziert.`,
        `Die Monatsrechnung ist jetzt zum Senden bereit.`,
        ``,
        `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/invoice?month=${monthFirst}`,
        ``,
        `TandemLog`,
      ].join('\n'),
    });
    return { sent: true };
  } catch (e) {
    // Roll back the claim if Resend failed, so a later attempt can retry.
    await svc.from('monthly_ready_emails')
      .delete().eq('pilot_id', pilotId).eq('month', monthFirst);
    return { sent: false, reason: `mail_failed: ${(e as Error).message}` };
  }
}
