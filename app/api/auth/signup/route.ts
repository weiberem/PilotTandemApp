import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Self-signup gated by a shared invite code (env SIGNUP_CODE).
 *
 * We create the user pre-confirmed (`email_confirm: true`) so the pilot can
 * sign in immediately with their chosen password — no round-trip through a
 * Supabase confirmation email, which would:
 *   - get pre-scanned by Gmail/Outlook and consume the single-use OTP
 *   - say "You've been invited" (confusing for a self-signup)
 *   - expire after 1 hour by default
 *
 * The invite-code gate is what keeps non-pilots out; an email-confirmation
 * round-trip would add no security on top of that, only friction.
 */
export async function POST(req: NextRequest) {
  const expectedCode = process.env.SIGNUP_CODE;
  if (!expectedCode) {
    return NextResponse.json({ error: 'signup_not_configured' }, { status: 500 });
  }

  let body: { email?: string; password?: string; full_name?: string; invite_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { email, password, full_name, invite_code } = body;
  if (!email || !password || !full_name || !invite_code) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  if (invite_code.trim() !== expectedCode) {
    return NextResponse.json({ error: 'invalid_invite_code' }, { status: 403 });
  }

  const svc = createServiceClient();
  const { error } = await svc.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim() },
  });
  if (error) {
    const msg = /already (registered|exists)|duplicate/i.test(error.message)
      ? 'email_already_registered'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
