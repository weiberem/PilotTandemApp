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
          ? 'Google is not connected.'
          : data.error === 'no_scheduled_days'
          ? 'No schedule available — import it first.'
          : data.detail ?? data.error ?? 'Error';
        setMsg({ kind: 'err', text: friendly });
        return;
      }
      setMsg({
        kind: 'ok',
        text: `${data.total} shifts in Google Calendar (${data.created} new, ${data.updated} updated).`,
      });
    });
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">Push to Google Calendar</div>
          <div className="text-xs text-text-muted">
            Creates the planned Skywings shifts as events. Re-running updates existing events.
          </div>
        </div>
        <button
          onClick={() => run(defaultMonth)}
          disabled={pending}
          className="btn-primary shrink-0"
        >
          <CalendarPlus className="w-4 h-4 mr-2" />
          {pending ? 'Pushing…' : 'Push'}
        </button>
      </div>
      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}
    </div>
  );
}
