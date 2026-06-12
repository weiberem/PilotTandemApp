import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getResend, getFromAddress } from '@/lib/email';
import { namesMatch } from '@/lib/pilotMatch';
import {
  buildChangeRequestEmail, type ChangeRequest, type ChangeRequestMap,
} from '@/lib/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.enum(['sick', 'conflict', 'different_time', 'swap', 'other']),
  note: z.string().max(1000).optional(),
  swap_with: z.string().max(120).optional(),   // colleague display name (reason==='swap')
});

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid input' }, { status: 400 });
  }
  const { date, reason, note, swap_with } = parsed.data;
  const month = `${date.slice(0, 7)}-01`;

  const { data: pilot } = await sb
    .from('pilots')
    .select('full_name, office_email, personal_email, is_demo')
    .eq('id', user.id)
    .maybeSingle();
  if (!pilot) return NextResponse.json({ error: 'pilot not found' }, { status: 404 });
  if (!pilot.office_email) {
    return NextResponse.json({ error: 'office_email missing — set it in Settings' }, { status: 400 });
  }

  const cr: ChangeRequest = {
    reason,
    note: note?.trim() || undefined,
    status: 'pending',
    created_at: new Date().toISOString(),
    resolved_at: null,
  };

  // For a swap, resolve the named colleague to an exact account id (when it's
  // unambiguous) so they — and only they — can see the incoming request. If the
  // roster name can't be matched to a single account, the swap still reaches
  // the office by email; it just won't surface in-app for the colleague.
  if (reason === 'swap' && swap_with?.trim()) {
    cr.swap_with = swap_with.trim();
    const svc = createServiceClient();
    const { data: candidates } = await svc
      .from('pilots')
      .select('id, full_name')
      .neq('id', user.id);
    const hits = (candidates ?? []).filter(p => namesMatch(cr.swap_with!, p.full_name ?? ''));
    if (hits.length === 1) cr.swap_with_pilot_id = hits[0].id as string;
  }

  // Merge onto the month's existing submission row (preserve days + other
  // change requests). The row may not exist yet if the pilot never submitted
  // availability but was scheduled anyway — days defaults to [].
  const { data: existing } = await sb
    .from('availability_submissions')
    .select('days, change_requests')
    .eq('pilot_id', user.id)
    .eq('month', month)
    .maybeSingle();

  const merged: ChangeRequestMap = {
    ...((existing?.change_requests as ChangeRequestMap | null) ?? {}),
    [date]: cr,
  };

  const { error: upErr } = await sb
    .from('availability_submissions')
    .upsert({
      pilot_id: user.id,
      month,
      days: existing?.days ?? [],
      change_requests: merged,
    }, { onConflict: 'pilot_id,month' });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Demo pilots never contact the office — record only.
  if (pilot.is_demo) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { subject, text: baseText } = buildChangeRequestEmail({
    pilotName: pilot.full_name ?? '', date, reason, note,
  });
  const text = cr.swap_with ? `${baseText}\nTausch mit: ${cr.swap_with}` : baseText;
  const cc = pilot.personal_email ? [pilot.personal_email] : undefined;

  let emailId: string | null = null;
  try {
    const r = await getResend().emails.send({
      from: getFromAddress(),
      to: pilot.office_email,
      cc,
      subject,
      text,
    });
    emailId = (r as { data?: { id?: string } }).data?.id ?? null;
  } catch (e) {
    return NextResponse.json({ error: 'email_send_failed', detail: String(e) }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email_id: emailId });
}
