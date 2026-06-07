'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createFlight } from '@/app/(pilot)/log/actions';
import { PHOTO_STATUSES, type FlightInput, type PhotoStatus } from '@/lib/flights';

type Props = {
  defaults: FlightInput;
  scheduledTimes: readonly string[];
  loggedCount: number;
  usedTripTimes: readonly string[];
};

export function QuickAddFlightRow({ defaults, scheduledTimes, loggedCount, usedTripTimes }: Props) {
  const usedSet = new Set(usedTripTimes);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tripTime, setTripTime] = useState(defaults.trip_time);
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>(defaults.photo_status);
  const [error, setError] = useState<string | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  function doAdd() {
    setError(null);
    startTransition(async () => {
      const r = await createFlight({
        ...defaults,
        trip_time: tripTime,
        photo_status: photoStatus,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPhotoStatus('none');
      router.refresh();
    });
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={doAdd}
          disabled={pending}
          aria-label="Flug erfassen"
          className={cn(
            'shrink-0 inline-flex items-center justify-center rounded-full bg-primary text-white',
            'w-12 h-12 shadow-sm hover:bg-primary-dark active:scale-95 transition',
            pending && 'opacity-60',
          )}
        >
          <Plus className="w-6 h-6" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTimePickerOpen(o => !o)}
              className="font-mono text-lg tabular-nums px-2 py-0.5 rounded-md hover:bg-bg-subtle"
              aria-expanded={timePickerOpen}
            >
              {tripTime}
            </button>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark">
              {defaults.company}
            </span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {loggedCount === 0 ? 'Erster Flug — Zeit & Foto-Status anpassbar' : `Nächster Flug nach ${loggedCount} bereits erfasst`}
          </div>
        </div>

        <Link
          href="/log"
          className="shrink-0 inline-flex items-center text-xs text-text-muted hover:text-primary"
          aria-label="Erweiterte Optionen"
        >
          Optionen <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {timePickerOpen && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
          {scheduledTimes.map(t => {
            const used = usedSet.has(t);
            const active = t === tripTime;
            return (
              <button
                key={t}
                type="button"
                disabled={used && !active}
                onClick={() => { setTripTime(t); setTimePickerOpen(false); }}
                title={used && !active ? 'Bereits erfasst' : undefined}
                className={cn(
                  'font-mono text-xs px-2 py-1 rounded-md border',
                  active
                    ? 'bg-primary text-white border-primary'
                    : used
                      ? 'bg-bg-subtle border-border text-text-muted line-through cursor-not-allowed opacity-60'
                      : 'bg-bg-card border-border hover:bg-bg-subtle',
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-text-muted">Foto</span>
        <div role="radiogroup" aria-label="Foto-Status" className="inline-flex rounded-full border border-border overflow-hidden text-xs">
          {PHOTO_STATUSES.map(s => {
            const active = s === photoStatus;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPhotoStatus(s)}
                className={cn(
                  'px-2.5 py-1 min-w-[32px] transition-colors',
                  active ? 'bg-primary text-white font-semibold' : 'bg-bg-card text-text-muted hover:bg-bg-subtle',
                )}
              >
                {s === 'none' ? '—' : s}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
