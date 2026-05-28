import { NextResponse, type NextRequest } from 'next/server';

/**
 * No-op middleware.
 *
 * The Supabase auth gate has been moved into the server components of
 * each route group (every protected page does `if (!user) redirect('/login')`).
 * Middleware was previously calling `createServerClient` + `auth.getUser()`
 * for an early redirect, but it was failing at module-load time inside
 * the Vercel Edge runtime with MIDDLEWARE_INVOCATION_FAILED.
 *
 * Keeping a minimal middleware file ensures Next.js still ships the
 * matcher config; the function itself only refreshes session cookies
 * by letting them pass through.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-.*).*)',
  ],
};
