import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Self-signup gated by a shared invite code (env SIGNUP_CODE).
 * Share the code with the team via WhatsApp; rotate by updating the env var
 * in Vercel when it leaks out.
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

  // Pre-set the password so after confirmation they can sign in directly.
  if (data.user) {
    await svc.auth.admin.updateUserById(data.user.id, { password });
  }

  return NextResponse.json({ ok: true });
}
