'use client';

import { useState, useTransition } from 'react';
import { Archive } from 'lucide-react';

export function BackupButton({ defaultMonth }: { defaultMonth?: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [month, setMonth] = useState(defaultMonth ?? '');

  function run() {
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/backup/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(month ? { month } : {}),
      });
      const data = await r.json();
      if (!r.ok) {
        const friendly = data.skipped === 'no_drive'
          ? 'Google Drive is not connected or main folder ID is missing.'
          : data.skipped === 'no_flights'
          ? 'No flights in the selected month.'
          : data.error ?? 'Error';
        setMsg({ kind: 'err', text: friendly });
        return;
      }
      const deleted = data.deleted?.length
        ? ` · ${data.deleted.length} old backup${data.deleted.length === 1 ? '' : 's'} deleted`
        : '';
      setMsg({ kind: 'ok', text: `Backup ${data.file_name} uploaded${deleted}.` });
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="text-xs flex-1">
          <span className="text-text-muted block">Month (optional)</span>
          <input
            type="month" value={month} onChange={e => setMonth(e.target.value ? `${e.target.value}-01` : '')}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
          />
        </label>
        <button onClick={run} disabled={pending} className="btn-primary">
          <Archive className="w-4 h-4 mr-2" />
          {pending ? 'Backup running…' : 'Back up now'}
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Creates an Excel with all flights of the month and uploads it to the main folder.
        Backups older than 2 months are deleted automatically.
      </p>
      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}
    </div>
  );
}
