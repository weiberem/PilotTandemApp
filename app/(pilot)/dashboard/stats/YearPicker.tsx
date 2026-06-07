'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export function YearPicker({
  year, options,
}: { year: number; options: number[] }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {options.map(y => {
        const active = y === year;
        return (
          <Link
            key={y}
            href={`/dashboard/stats?year=${y}`}
            className={cn(
              'font-mono tabular-nums px-2 py-1 rounded-md',
              active
                ? 'bg-text text-white font-semibold'
                : 'text-text-muted hover:bg-bg-subtle hover:text-text',
            )}
          >
            {y}
          </Link>
        );
      })}
    </div>
  );
}
