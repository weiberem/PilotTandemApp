'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Calendar, BarChart3, Settings } from 'lucide-react';
import { Paraglider } from '@/components/icons/Paraglider';
import { Spinner } from '@/components/Spinner';
import { cn } from '@/lib/utils';

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  tour?: string;
};

const items: readonly Item[] = [
  { href: '/availability', label: 'Working days', icon: Calendar },
  { href: '/home', label: 'Log', icon: Paraglider, primary: true },
  { href: '/dashboard/stats', label: 'Invoice', icon: BarChart3, tour: 'nav-invoice' },
  { href: '/settings', label: 'Settings', icon: Settings, tour: 'nav-settings' },
];

function isActive(path: string, href: string): boolean {
  if (href === '/home') return path === '/home' || path === '/today' || path.startsWith('/log') || path.startsWith('/flights') || path.startsWith('/summary');
  if (href === '/availability') return path.startsWith('/availability') || path.startsWith('/einsatzplan');
  if (href === '/dashboard/stats') return path.startsWith('/dashboard');
  return path.startsWith(href);
}

export function BottomNav() {
  const path = usePathname();
  // Which tab the user just tapped — shows a spinner until the new route loads.
  const [navTarget, setNavTarget] = useState<string | null>(null);
  useEffect(() => { setNavTarget(null); }, [path]);

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-border z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="relative flex items-end justify-around h-16">
        {items.map(({ href, label, icon: Icon, primary, tour }) => {
          const active = isActive(path, href);
          const loading = navTarget === href && !active;
          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                onClick={() => setNavTarget(href)}
                className="flex-1 flex flex-col items-center justify-end gap-0.5 min-h-tap text-[11px] relative"
              >
                <span className={cn(
                  'absolute -top-5 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition active:scale-90',
                  active ? 'bg-primary text-white' : 'bg-accent text-white',
                )}>
                  {loading ? <Spinner className="w-7 h-7" /> : <Icon className="w-7 h-7" />}
                </span>
                <span className={cn('mt-9', active ? 'text-primary font-medium' : 'text-text-muted')}>{label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              data-tour={tour}
              onClick={() => setNavTarget(href)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-tap text-[11px] transition active:scale-90',
                active ? 'text-primary' : loading ? 'text-primary' : 'text-text-muted',
              )}
            >
              {loading ? <Spinner className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
