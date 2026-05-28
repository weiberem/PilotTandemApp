import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { exchangeCode } from '@/lib/googleDrive';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = cookies().get('gdrive_oauth_state')?.value;
  cookies().delete('gdrive_oauth_state');

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL('/settings?gdrive=state_mismatch', req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // No refresh token means the user previously consented; force prompt=consent
      // already does it, but if it still happens, ask them to revoke and retry.
      return NextResponse.redirect(new URL('/settings?gdrive=no_refresh', req.url));
    }
    const { error } = await supabase
      .from('pilots')
      .update({ google_refresh_token: tokens.refresh_token })
      .eq('id', user.id);
    if (error) throw error;
    return NextResponse.redirect(new URL('/settings?gdrive=connected', req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.redirect(new URL(`/settings?gdrive=error&msg=${encodeURIComponent(msg)}`, req.url));
  }
}
