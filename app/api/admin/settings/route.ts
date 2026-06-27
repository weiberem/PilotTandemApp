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

/** GET — current app settings (season). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const svc = createServiceClient();
  const { data } = await svc.from('app_settings').select('current_season').eq('id', 1).maybeSingle();
  return NextResponse.json({ current_season: data?.current_season ?? 'auto' });
}

/** POST — set the office-wide season. Body: { current_season: 'auto'|'summer'|'winter' } */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { current_season?: string };
  const season = body.current_season;
  if (season !== 'auto' && season !== 'summer' && season !== 'winter') {
    return NextResponse.json({ error: 'current_season must be auto, summer or winter' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from('app_settings')
    .upsert({ id: 1, current_season: season, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, current_season: season });
}
