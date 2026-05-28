'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Plus, Calendar, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Heute', icon: Home },
  { href: '/availability', label: 'Kalender', icon: Calendar },
  { href: '/dashboard/stats', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
] as const;

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-border z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="relative flex items-end justify-around h-16">
        {items.slice(0, 2).map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link key={href} href={href} className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-tap text-[11px]',
              active ? 'text-primary' : 'text-text-muted',
            )}>
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        <Link
          href="/log"
          aria-label="Flug erfassen"
          className="absolute left-1/2 -translate-x-1/2 -top-5 w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          <Plus className="w-7 h-7" />
        </Link>
        {items.slice(2).map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link key={href} href={href} className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-tap text-[11px]',
              active ? 'text-primary' : 'text-text-muted',
            )}>
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
