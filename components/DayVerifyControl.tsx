'use client';

import { useState, useTransition } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { formatDateDe } from '@/lib/utils';
import { verifyDay, unverifyDay } from '@/app/(pilot)/summary/actions';

type Props = {
  date: string;
  verifiedAt: string | null;
  flightCount: number;
};

export function DayVerifyControl({ date, verifiedAt, flightCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ verifiedAt: string | null; mailSent: boolean | null }>({
    verifiedAt,
    mailSent: null,
  });
  const [error, setError] = useState<string | null>(null);

  if (flightCount === 0) return null;

  function onVerify() {
    setError(null);
    startTransition(async () => {
      const r = await verifyDay(date);
      if (!r.ok) { setError(r.error ?? 'Error'); return; }
      setState({ verifiedAt: new Date().toISOString(), mailSent: !!r.mail?.sent });
    });
  }
  function onUndo() {
    setError(null);
    startTransition(async () => {
      const r = await unverifyDay(date);
      if (!r.ok) { setError(r.error ?? 'Error'); return; }
      setState({ verifiedAt: null, mailSent: null });
    });
  }

  if (state.verifiedAt) {
    return (
      <div className="card p-4 border-l-4 border-l-success space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-5 h-5 text-success" />
          <span>
            <span className="font-semibold">Day verified</span>{' '}
            <span className="text-text-muted">
              · {formatDateDe(state.verifiedAt, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        </div>
        {state.mailSent && (
          <p className="text-xs text-success">
            All days of the month verified — confirmation email sent.
          </p>
        )}
        <button
          type="button"
          onClick={onUndo}
          disabled={pending}
          className="text-xs text-text-muted underline-offset-2 hover:underline"
        >
          {pending ? '…' : 'Undo verification'}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 border-l-4 border-l-warning space-y-3">
      <div className="flex items-start gap-2 text-sm">
        <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Day not yet verified</div>
          <p className="text-text-muted text-xs mt-0.5">
            Reconcile with the desk day sheet (flights, PP, Thermal, No-Show). If everything matches: confirm.
            If something doesn't match: correct via &quot;Today's Flights&quot; first, then verify here.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onVerify}
        disabled={pending}
        className="btn-primary w-full"
      >
        <Check className="w-4 h-4 mr-2" />
        {pending ? 'Verifying…' : 'Verify day'}
      </button>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
