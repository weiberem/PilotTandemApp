import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runMonthlyBackup } from '@/lib/runBackup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { month?: "YYYY-MM-01" } — defaults to the previous calendar month.
 * Builds the Excel backup in the pilot's hand-maintained layout, uploads it
 * into the root Drive folder, and prunes anything older than 2 months.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { month?: string };
  let monthFirst = body.month ?? '';
  if (!/^\d{4}-\d{2}-01$/.test(monthFirst)) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    monthFirst = `${y}-${m}-01`;
  }

  const result = await runMonthlyBackup(user.id, monthFirst);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.skipped ? 400 : 500 });
  }
  return NextResponse.json({ ...result, month: monthFirst });
}
