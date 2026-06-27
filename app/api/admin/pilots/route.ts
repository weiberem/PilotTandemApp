import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('admins').select('id').eq('id', user.id).maybeSingle();
  return data ? user : null;
}

/** A readable strong temporary password (letters + digits, ~14 chars). */
function generatePassword(): string {
  return randomBytes(18).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
}

/** GET — list pilots (uses service-role client; admin-guarded). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const svc = createServiceClient();
  const { data: pilots, error } = await svc
    .from('pilots')
    .select('id, full_name, is_active, google_enabled, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Augment with auth email + last_sign_in_at.
  const ids = pilots.map(p => p.id);
  const enriched = await Promise.all(ids.map(async (id) => {
    const { data } = await svc.auth.admin.getUserById(id);
    return {
      id,
      email: data.user?.email ?? null,
      last_sign_in_at: data.user?.last_sign_in_at ?? null,
    };
  }));
  const byId = new Map(enriched.map(e => [e.id, e]));

  return NextResponse.json({
    pilots: pilots.map(p => ({
      ...p,
      google_enabled: p.google_enabled ?? true,
      email: byId.get(p.id)?.email ?? null,
      last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
    })),
  });
}

/**
 * POST — provision a new pilot. Body: { email, full_name, mode?, office_email?, password? }
 *   mode 'password' (default): create the account directly with a password
 *     (returned so the admin can hand over the credentials — no self-registration).
 *   mode 'invite': send an invitation email; the recipient sets their own password.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    email?: string; full_name?: string; mode?: 'password' | 'invite';
    office_email?: string; password?: string;
  };
  const email = body.email?.trim();
  const full_name = body.full_name?.trim();
  if (!email || !full_name) {
    return NextResponse.json({ error: 'email and full_name required' }, { status: 400 });
  }
  const office_email = body.office_email?.trim() || null;
  const svc = createServiceClient();

  if (body.mode === 'invite') {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/register`;
    const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data.user) {
      await svc.from('pilots').upsert({
        id: data.user.id, full_name, is_active: true,
        ...(office_email ? { office_email } : {}),
      }, { onConflict: 'id' });
    }
    return NextResponse.json({ ok: true, user_id: data.user?.id, mode: 'invite' });
  }

  // Direct creation with a password the admin can pass on.
  const password = body.password && body.password.length >= 8 ? body.password : generatePassword();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // handle_new_user trigger inserts the pilots row; make sure name/office are set.
  if (data.user) {
    await svc.from('pilots').upsert({
      id: data.user.id, full_name, is_active: true,
      ...(office_email ? { office_email } : {}),
    }, { onConflict: 'id' });
  }
  return NextResponse.json({ ok: true, user_id: data.user?.id, mode: 'password', email, password });
}

/** PATCH — update flags. Body: { id, is_active?, google_enabled? } */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    id?: string; is_active?: boolean; google_enabled?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const svc = createServiceClient();

  const patch: Record<string, boolean> = {};
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (typeof body.google_enabled === 'boolean') patch.google_enabled = body.google_enabled;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { error } = await svc.from('pilots').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Banning the auth user prevents login for deactivated pilots.
  if (typeof body.is_active === 'boolean') {
    await svc.auth.admin.updateUserById(body.id, {
      ban_duration: body.is_active ? 'none' : '876000h',  // ~100 years
    });
  }

  return NextResponse.json({ ok: true });
}
