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
      if (!r.ok) { setError(r.error ?? 'Fehler'); return; }
      setState({ verifiedAt: new Date().toISOString(), mailSent: !!r.mail?.sent });
    });
  }
  function onUndo() {
    setError(null);
    startTransition(async () => {
      const r = await unverifyDay(date);
      if (!r.ok) { setError(r.error ?? 'Fehler'); return; }
      setState({ verifiedAt: null, mailSent: null });
    });
  }

  if (state.verifiedAt) {
    return (
      <div className="card p-4 border-l-4 border-l-success space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-5 h-5 text-success" />
          <span>
            <span className="font-semibold">Tag verifiziert</span>{' '}
            <span className="text-text-muted">
              · {formatDateDe(state.verifiedAt, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        </div>
        {state.mailSent && (
          <p className="text-xs text-success">
            Alle Tage des Monats verifiziert — Bestätigungs-E-Mail wurde verschickt.
          </p>
        )}
        <button
          type="button"
          onClick={onUndo}
          disabled={pending}
          className="text-xs text-text-muted underline-offset-2 hover:underline"
        >
          {pending ? '…' : 'Verifikation zurücknehmen'}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 border-l-4 border-l-warning space-y-3">
      <div className="flex items-start gap-2 text-sm">
        <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Tag noch nicht verifiziert</div>
          <p className="text-text-muted text-xs mt-0.5">
            Mit dem Desk-Tagesblatt abgleichen (Flüge, PP, Thermal, No-Show). Wenn alles stimmt: bestätigen.
            Falls etwas nicht passt: zuerst über &quot;Heutige Flüge&quot; korrigieren, dann hier verifizieren.
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
        {pending ? 'Verifiziere…' : 'Tag verifizieren'}
      </button>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
