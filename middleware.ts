import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth gate: redirect unauthenticated users to /login, and redirect
 * already-signed-in users away from the auth pages.
 *
 * Wrapped in a top-level try/catch: any failure (missing env var,
 * Supabase transient outage, cookie parse error) lets the request
 * through with the unmodified response, so we never serve a 500 from
 * the middleware itself. The server components then re-check auth.
 */
export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;
    const isAuthRoute = path.startsWith('/login') || path.startsWith('/register');

    if (!user && !isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    if (user && isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  } catch (err) {
    // Never fail the request because of middleware — server components re-auth.
    console.error('middleware error:', err);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Only run on app routes that need an auth gate.
     * Exclude all /api/* (server routes auth themselves), Next static
     * assets, and PWA assets.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-.*).*)',
  ],
};
