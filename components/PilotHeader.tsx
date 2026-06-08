'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

/**
 * App header. On top-level pages (Heute/Kalender/Stats/Einstellungen and
 * the home dashboard) it shows the brand wordmark + pilot name. On any
 * deeper route it shows a back chevron and a short page title — needed
 * because the app is often used as a home-screen standalone app where
 * Safari hides its own back button.
 */
const TOP_LEVEL = new Set(['/home', '/availability', '/dashboard/stats', '/settings']);

const TITLE_MAP: Array<{ match: RegExp; title: string }> = [
  { match: /^\/log\/[^/]+\/edit$/, title: 'Edit Flight' },
  { match: /^\/log$/,               title: 'Log Flight' },
  { match: /^\/today$/,             title: "Today's Flights" },
  { match: /^\/summary$/,           title: 'Day Summary' },
  { match: /^\/flights$/,           title: 'All Flights' },
  { match: /^\/einsatzplan$/,       title: 'Schedule' },
  { match: /^\/dashboard\/invoice$/, title: 'Invoice' },
];

function titleFor(path: string): string {
  for (const t of TITLE_MAP) if (t.match.test(path)) return t.title;
  return '';
}

export function PilotHeader({ pilotLabel }: { pilotLabel: string }) {
  const pathname = usePathname() ?? '/home';
  const router = useRouter();
  const isTop = TOP_LEVEL.has(pathname);
  const title = isTop ? '' : titleFor(pathname);

  return (
    <header className="bg-bg-dark text-white px-4 py-3 flex items-center justify-between min-h-[52px]">
      {isTop ? (
        <>
          <Link href="/home" className="font-display font-semibold tracking-tight">
            Tandem<span className="text-primary">Log</span>
          </Link>
          <span className="text-xs text-white/70">{pilotLabel}</span>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 -ml-1 px-2 py-1 rounded-md hover:bg-white/10 active:bg-white/20 min-h-tap"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
          <span className="font-display font-semibold tracking-tight">{title || 'TandemLog'}</span>
          <Link href="/home" className="text-xs text-white/70 px-2 py-1 rounded-md hover:bg-white/10 min-h-tap inline-flex items-center" aria-label="Home">
            Home
          </Link>
        </>
      )}
    </header>
  );
}
