'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { setFlightPhotoStatus } from '@/app/(pilot)/log/actions';
import { PHOTO_STATUSES, type PhotoStatus } from '@/lib/flights';

export function PhotoStatusSwitch({
  flightId, current, disabled = false,
}: { flightId: string; current: PhotoStatus; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<PhotoStatus | null>(null);
  const value = optimistic ?? current;

  function pick(status: PhotoStatus) {
    if (disabled || status === value) return;
    setOptimistic(status);
    startTransition(async () => {
      const r = await setFlightPhotoStatus(flightId, status);
      if (!r.ok) {
        setOptimistic(null);
        alert(r.error ?? 'Fehler beim Speichern');
        return;
      }
      router.refresh();
      setOptimistic(null);
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Foto-Status"
      className={cn(
        'inline-flex rounded-full border border-border overflow-hidden text-xs',
        disabled && 'opacity-40',
        pending && 'opacity-70',
      )}
    >
      {PHOTO_STATUSES.map(s => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || pending}
            onClick={(e) => { e.preventDefault(); pick(s); }}
            className={cn(
              'px-2 py-0.5 min-w-[28px] transition-colors',
              active ? 'bg-primary text-white font-semibold' : 'bg-bg-card text-text-muted hover:bg-bg-subtle',
            )}
          >
            {s === 'none' ? '—' : s}
          </button>
        );
      })}
    </div>
  );
}
