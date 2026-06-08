import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily cleanup: deletes auth users for any demo pilot whose
 * demo_expires_at has passed. The pilots row + flights + day_verifications
 * + invoices etc. cascade-delete via the auth.users FK.
 *
 * Secured with CRON_SECRET (header / Bearer).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron not configured' }, { status: 500 });

  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const { data: expired, error: qerr } = await svc
    .from('pilots')
    .select('id')
    .eq('is_demo', true)
    .lt('demo_expires_at', now);
  if (qerr) {
    // Migration 010 not yet applied? Be tolerant.
    if (/column .*is_demo/i.test(qerr.message)) {
      return NextResponse.json({ ok: true, skipped: 'migration_010_missing' });
    }
    return NextResponse.json({ error: qerr.message }, { status: 500 });
  }

  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const row of expired ?? []) {
    const id = row.id as string;
    const { error: delErr } = await svc.auth.admin.deleteUser(id);
    if (delErr) failed.push({ id, error: delErr.message });
    else deleted.push(id);
  }

  return NextResponse.json({ ok: true, deleted: deleted.length, failed });
}
