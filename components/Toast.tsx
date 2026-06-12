'use client';

import { useEffect } from 'react';
import { Check, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastMsg = { kind: 'ok' | 'err'; text: string };

/**
 * Lightweight auto-dismissing toast (fixed, above the bottom nav). Replaces
 * long inline status/error text with a short, scannable notice. Errors linger
 * a little longer and stay dismissable.
 */
export function Toast({ msg, onClose }: { msg: ToastMsg | null; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, msg.kind === 'err' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [msg, onClose]);

  if (!msg) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        className={cn(
          'pointer-events-auto max-w-sm w-full rounded-lg px-3 py-2.5 text-sm shadow-lg flex items-start gap-2',
          msg.kind === 'ok' ? 'bg-success text-white' : 'bg-danger text-white',
        )}
      >
        {msg.kind === 'ok'
          ? <Check className="w-4 h-4 mt-0.5 shrink-0" />
          : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
        <span className="flex-1 break-words">{msg.text}</span>
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
