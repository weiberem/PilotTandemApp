import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { buildAuthUrl, redirectUriFromRequest } from '@/lib/googleDrive';
import { notifyDriveAccessRequest } from '@/lib/notify';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // First connect attempt → ping the owner with the requester's email so they
  // can whitelist them as a Google test user. Skip if already connected, and
  // throttle to once per day per browser so retries don't spam.
  const { data: pilot } = await supabase
    .from('pilots').select('google_refresh_token').eq('id', user.id).maybeSingle();
  if (user.email && !pilot?.google_refresh_token && !cookies().get('gdrive_access_notified')?.value) {
    await notifyDriveAccessRequest(user.email);
    cookies().set('gdrive_access_notified', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });
  }

  const state = randomBytes(24).toString('hex');
  cookies().set('gdrive_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return NextResponse.redirect(buildAuthUrl(state, redirectUriFromRequest(req)));
}
