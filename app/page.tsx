import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Root gateway: send users to /home (if signed in) or /login.
 * Kept deliberately tiny so the root URL can never surface a server
 * component crash from the (pilot) route group. Any failure inside
 * the auth probe falls through to /login.
 */
export const dynamic = 'force-dynamic';

export default async function Index() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect('/home');
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    // fall through to /login
  }
  redirect('/login');
}
