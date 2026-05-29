'use client';

import { useState, useTransition } from 'react';
import { CalendarPlus } from 'lucide-react';

/**
 * Pushes the imported Skywings schedule into the pilot's Google Calendar.
 * Idempotent on the server (updates instead of duplicating).
 */
export function CalendarPushButton({ defaultMonth }: { defaultMonth?: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function run(month?: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/gcal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(month ? { month } : {}),
      });
      const data = await r.json();
      if (!r.ok) {
        const friendly = data.error === 'not_connected'
          ? 'Google ist nicht verbunden.'
          : data.error === 'no_scheduled_days'
          ? 'Kein Einsatzplan vorhanden — zuerst importieren.'
          : data.detail ?? data.error ?? 'Fehler';
        setMsg({ kind: 'err', text: friendly });
        return;
      }
      setMsg({
        kind: 'ok',
        text: `${data.total} Einsätze im Google Kalender (${data.created} neu, ${data.updated} aktualisiert).`,
      });
    });
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">In Google Kalender übertragen</div>
          <div className="text-xs text-text-muted">
            Legt die geplanten Skywings-Einsätze als Termine an. Erneutes Übertragen aktualisiert bestehende Termine.
          </div>
        </div>
        <button
          onClick={() => run(defaultMonth)}
          disabled={pending}
          className="btn-primary shrink-0"
        >
          <CalendarPlus className="w-4 h-4 mr-2" />
          {pending ? 'Übertrage…' : 'Übertragen'}
        </button>
      </div>
      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}
    </div>
  );
}
