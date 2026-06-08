'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { verifyDay, unverifyDay } from '@/app/(pilot)/summary/actions';

type Props = {
  date: string;
  verified: boolean;
  flightCount: number;
  size?: 'sm' | 'md';
};

export function DayVerifyButton({ date, verified, flightCount, size = 'sm' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (flightCount === 0) return null;

  function toggle() {
    setError(null);
    startTransition(async () => {
      const r = verified ? await unverifyDay(date) : await verifyDay(date);
      if (!r.ok) { setError(r.error ?? 'Error'); return; }
      router.refresh();
    });
  }

  const base = size === 'md'
    ? 'px-3 py-1.5 text-sm rounded-lg'
    : 'px-2 py-1 text-xs rounded-md';

  if (verified) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(base, 'inline-flex items-center gap-1 border border-success/30 bg-success/10 text-success hover:bg-success/20')}
        title="Undo verification"
      >
        <Check className="w-3.5 h-3.5" />
        Verified
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(base, 'inline-flex items-center gap-1 border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20')}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        {pending ? 'Verifying…' : 'Verify'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
