'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { deleteDayFlights } from '@/app/(pilot)/log/bulkActions';

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function DayControls({
  viewDate,
  realToday,
  flightCount,
}: {
  viewDate: string;
  realToday: string;
  flightCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function goto(date: string) {
    if (date === realToday) router.push('/home');
    else router.push(`/home?date=${date}`);
  }

  function reset() {
    setConfirming(false);
    startTransition(async () => {
      await deleteDayFlights({ flight_date: viewDate });
      router.refresh();
    });
  }

  const isToday = viewDate === realToday;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-full border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => goto(shiftIso(viewDate, -1))}
          className="px-2 py-1.5 hover:bg-bg-subtle"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <label className="relative px-1">
          <input
            type="date"
            value={viewDate}
            max={realToday}
            onChange={(e) => e.target.value && goto(e.target.value)}
            className="bg-transparent text-sm font-medium outline-none cursor-pointer"
          />
        </label>
        <button
          type="button"
          onClick={() => goto(shiftIso(viewDate, 1))}
          disabled={isToday}
          className="px-2 py-1.5 hover:bg-bg-subtle disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {!isToday && (
        <button type="button" onClick={() => goto(realToday)} className="text-xs text-accent">
          Today
        </button>
      )}

      {flightCount > 0 && (
        confirming ? (
          <span className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-full bg-danger px-2 py-1 text-white"
            >
              {pending ? 'Deleting…' : `Delete ${flightCount}`}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="px-1 text-text-muted">
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 rounded-full border border-border px-2 py-1.5 text-xs text-text-muted hover:text-danger hover:border-danger"
            aria-label="Reset day"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        )
      )}
    </div>
  );
}
