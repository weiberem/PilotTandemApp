'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Plane, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = {
  href: string;
  label: string;
  icon: typeof Calendar;
  primary?: boolean;
};

const items: readonly Item[] = [
  { href: '/availability', label: 'Einsatztage', icon: Calendar },
  { href: '/home', label: 'Erfassen', icon: Plane, primary: true },
  { href: '/dashboard/stats', label: 'Rechnung', icon: BarChart3 },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
];

function isActive(path: string, href: string): boolean {
  if (href === '/home') return path === '/home' || path === '/today' || path.startsWith('/log') || path.startsWith('/flights') || path.startsWith('/summary');
  if (href === '/availability') return path.startsWith('/availability') || path.startsWith('/einsatzplan');
  if (href === '/dashboard/stats') return path.startsWith('/dashboard');
  return path.startsWith(href);
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-border z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="relative flex items-end justify-around h-16">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = isActive(path, href);
          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="flex-1 flex flex-col items-center justify-end gap-0.5 min-h-tap text-[11px] relative"
              >
                <span className={cn(
                  'absolute -top-5 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition active:scale-95',
                  active ? 'bg-primary text-white' : 'bg-accent text-white',
                )}>
                  <Icon className="w-7 h-7 -rotate-45" />
                </span>
                <span className={cn('mt-9', active ? 'text-primary font-medium' : 'text-text-muted')}>{label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-tap text-[11px]',
                active ? 'text-primary' : 'text-text-muted',
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
