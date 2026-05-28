import { NextResponse, type NextRequest } from 'next/server';
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

/** GET — list pilots (uses service-role client; admin-guarded). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const svc = createServiceClient();
  const { data: pilots, error } = await svc
    .from('pilots')
    .select('id, full_name, is_active, created_at')
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
      email: byId.get(p.id)?.email ?? null,
      last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
    })),
  });
}

/** POST — invite a new pilot. Body: { email, full_name } */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { email?: string; full_name?: string };
  if (!body.email || !body.full_name) {
    return NextResponse.json({ error: 'email and full_name required' }, { status: 400 });
  }

  const svc = createServiceClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/register`;
  const { data, error } = await svc.auth.admin.inviteUserByEmail(body.email, {
    data: { full_name: body.full_name },
    redirectTo,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The handle_new_user trigger inserts pilots row on auth.users insert,
  // but inviteUserByEmail creates the row before our trigger sees the metadata
  // on some versions — make sure full_name is set.
  if (data.user) {
    await svc.from('pilots').upsert({
      id: data.user.id,
      full_name: body.full_name,
      is_active: true,
    }, { onConflict: 'id' });
  }

  return NextResponse.json({ ok: true, user_id: data.user?.id });
}

/** PATCH — activate / deactivate. Body: { id, is_active } */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { id?: string; is_active?: boolean };
  if (!body.id || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active required' }, { status: 400 });
  }
  const svc = createServiceClient();
  const { error } = await svc.from('pilots').update({ is_active: body.is_active }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Banning the auth user prevents login for deactivated pilots.
  await svc.auth.admin.updateUserById(body.id, {
    ban_duration: body.is_active ? 'none' : '876000h',  // ~100 years
  });

  return NextResponse.json({ ok: true });
}
