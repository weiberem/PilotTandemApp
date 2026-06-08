'use client';

import { useState, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, AlertCircle, Wind, Trash2 } from 'lucide-react';
import { cn, formatChf } from '@/lib/utils';
import { deleteFlight } from '@/app/(pilot)/log/actions';
import type { FlightRow } from '@/lib/flights';

const SWIPE_TRIGGER = 96;     // pixels of left-swipe to reveal delete
const SWIPE_COMMIT = 240;     // pixels to auto-delete on release

export function FlightListItem({ flight }: { flight: FlightRow }) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const startX = useRef<number | null>(null);
  const moved = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX.current = e.clientX;
    moved.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 6) moved.current = true;
    if (dx < 0) setOffset(Math.max(dx, -SWIPE_COMMIT));
    else setOffset(0);
  }
  function onPointerUp() {
    if (startX.current === null) return;
    startX.current = null;
    if (offset <= -SWIPE_COMMIT + 10) {
      setConfirming(true);
      setOffset(-SWIPE_TRIGGER);
    } else if (offset <= -SWIPE_TRIGGER) {
      setOffset(-SWIPE_TRIGGER);
    } else {
      setOffset(0);
    }
  }

  function doDelete() {
    startTransition(async () => {
      const r = await deleteFlight(flight.id);
      if (r.ok) router.refresh();
    });
  }

  const photoLabel = flight.photo_status === 'none' ? null : flight.photo_status;
  const tipNum = Number(flight.tip_chf ?? 0);

  return (
    <li className="relative overflow-hidden card">
      {/* swipe-revealed delete background */}
      <div className="absolute inset-y-0 right-0 flex items-center bg-danger text-white px-4 gap-2">
        <Trash2 className="w-4 h-4" /> Delete
      </div>
      <div
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { startX.current = null; setOffset(0); }}
        className="relative bg-bg-card transition-transform touch-pan-y"
      >
        <Link
          href={`/log/${flight.id}/edit`}
          onClick={e => { if (moved.current) e.preventDefault(); }}
          className="flex items-center gap-3 p-3 min-h-[64px]"
        >
          <div className="font-mono text-lg tabular-nums w-14">{flight.trip_time}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark">
                {flight.company}
              </span>
              {photoLabel && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-bg border border-border inline-flex items-center gap-1">
                  <Camera className="w-3 h-3" /> {photoLabel}
                </span>
              )}
              {flight.is_no_show && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> No-Show
                </span>
              )}
              {flight.is_double_airtime && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent inline-flex items-center gap-1">
                  <Wind className="w-3 h-3" /> Thermal
                </span>
              )}
            </div>
            {flight.notes && (
              <p className="text-xs text-text-muted truncate mt-0.5">{flight.notes}</p>
            )}
          </div>
          {tipNum > 0 && (
            <div className="text-right">
              <div className="text-xs text-text-muted">Tip</div>
              <div className="font-mono text-sm">{formatChf(tipNum)}</div>
            </div>
          )}
        </Link>
      </div>

      {confirming && (
        <div className="absolute inset-0 bg-bg-card/95 backdrop-blur-sm flex items-center justify-between gap-2 px-3" role="dialog">
          <span className="text-sm">Delete?</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setConfirming(false); setOffset(0); }}
              className="btn-ghost border border-border px-3 min-h-[40px]"
            >No</button>
            <button
              onClick={doDelete}
              disabled={pending}
              className="min-h-[40px] rounded-lg bg-danger text-white px-3"
            >{pending ? '…' : 'Yes'}</button>
          </div>
        </div>
      )}
    </li>
  );
}
