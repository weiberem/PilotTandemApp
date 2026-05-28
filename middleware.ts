import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico
     * - public assets (icons, manifest, service worker, workbox)
     * - api/cron (cron secret-guarded)
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-.*|api/cron).*)',
  ],
};
