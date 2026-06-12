import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getResend, getFromAddress } from '@/lib/email';
import { buildSwapMatchEmail, type ChangeRequestMap } from '@/lib/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromPilotId: z.string().uuid(),
});

/**
 * The targeted colleague accepts an incoming swap. Marks the requester's
 * change request 'matched' and emails the office one both-parties-confirmed
 * message (cc both pilots). Only the resolved target may accept.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { date, fromPilotId } = parsed.data;
  const month = `${date.slice(0, 7)}-01`;

  const svc = createServiceClient();

  // Load the requester's row + verify the swap targets the caller.
  const { data: row } = await svc
    .from('availability_submissions')
    .select('change_requests')
    .eq('pilot_id', fromPilotId)
    .eq('month', month)
    .maybeSingle();
  const map = (row?.change_requests as ChangeRequestMap | null) ?? {};
  const cr = map[date];
  if (!cr || cr.reason !== 'swap' || cr.status !== 'pending') {
    return NextResponse.json({ error: 'no pending swap for this day' }, { status: 404 });
  }
  if (cr.swap_with_pilot_id !== user.id) {
    return NextResponse.json({ error: 'this swap is not addressed to you' }, { status: 403 });
  }

  const { data: requester } = await svc
    .from('pilots')
    .select('full_name, office_email, personal_email, is_demo')
    .eq('id', fromPilotId)
    .maybeSingle();
  const { data: accepter } = await svc
    .from('pilots')
    .select('full_name, personal_email')
    .eq('id', user.id)
    .maybeSingle();
  if (!requester) return NextResponse.json({ error: 'requester not found' }, { status: 404 });

  // Mark matched on the requester's row.
  map[date] = {
    ...cr,
    status: 'matched',
    matched_with: accepter?.full_name ?? '',
    matched_at: new Date().toISOString(),
  };
  const { error: upErr } = await svc
    .from('availability_submissions')
    .update({ change_requests: map })
    .eq('pilot_id', fromPilotId)
    .eq('month', month);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  if (requester.is_demo) return NextResponse.json({ ok: true, demo: true });
  if (!requester.office_email) return NextResponse.json({ ok: true, email_skipped: 'no office email' });

  const { subject, text } = buildSwapMatchEmail({
    requester: requester.full_name ?? '',
    accepter: accepter?.full_name ?? '',
    date,
    note: cr.note,
  });
  const cc = [requester.personal_email, accepter?.personal_email].filter((s): s is string => !!s);

  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to: requester.office_email,
      cc: cc.length ? cc : undefined,
      subject,
      text,
    });
  } catch (e) {
    return NextResponse.json({ error: 'email_send_failed', detail: String(e) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
