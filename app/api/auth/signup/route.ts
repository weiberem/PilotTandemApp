import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Self-signup with two gates:
 *   1. shared invite code (env SIGNUP_CODE) — share via team WhatsApp,
 *      rotate when needed
 *   2. Cloudflare Turnstile captcha token (env TURNSTILE_SECRET_KEY) —
 *      blocks bots and credential-stuffing
 *
 * Both are required. If either env var is missing the route returns 500
 * so a misconfigured deploy can't accidentally let everything through.
 */
export async function POST(req: NextRequest) {
  const expectedCode = process.env.SIGNUP_CODE;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!expectedCode || !turnstileSecret) {
    return NextResponse.json({ error: 'signup_not_configured' }, { status: 500 });
  }

  let body: { email?: string; password?: string; full_name?: string; invite_code?: string; captcha_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { email, password, full_name, invite_code, captcha_token } = body;
  if (!email || !password || !full_name || !invite_code || !captcha_token) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  if (invite_code !== expectedCode) {
    return NextResponse.json({ error: 'invalid_invite_code' }, { status: 403 });
  }

  // Verify Turnstile token with Cloudflare.
  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: turnstileSecret,
      response: captcha_token,
      remoteip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
    }),
  });
  const verify = await verifyRes.json().catch(() => ({})) as { success?: boolean };
  if (!verify.success) {
    return NextResponse.json({ error: 'captcha_failed' }, { status: 403 });
  }

  // Create the auth user. Email confirmation is on, so they must click the
  // link in the confirmation mail before they can sign in.
  const svc = createServiceClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/onboarding`;

  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo,
  });
  if (error) {
    const msg = /already registered|exists/i.test(error.message)
      ? 'email_already_registered'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Pre-set the password so the confirmation flow can land them directly
  // signed in. (inviteUserByEmail creates the user with no password.)
  if (data.user) {
    await svc.auth.admin.updateUserById(data.user.id, { password });
  }

  return NextResponse.json({ ok: true });
}
