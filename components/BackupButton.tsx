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
          ? 'Google Drive ist nicht verbunden oder Hauptordner-ID fehlt.'
          : data.skipped === 'no_flights'
          ? 'Keine Flüge im gewählten Monat.'
          : data.error ?? 'Fehler';
        setMsg({ kind: 'err', text: friendly });
        return;
      }
      const deleted = data.deleted?.length
        ? ` · ${data.deleted.length} alte Backup${data.deleted.length === 1 ? '' : 's'} gelöscht`
        : '';
      setMsg({ kind: 'ok', text: `Backup ${data.file_name} hochgeladen${deleted}.` });
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="text-xs flex-1">
          <span className="text-text-muted block">Monat (optional)</span>
          <input
            type="month" value={month} onChange={e => setMonth(e.target.value ? `${e.target.value}-01` : '')}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
          />
        </label>
        <button onClick={run} disabled={pending} className="btn-primary">
          <Archive className="w-4 h-4 mr-2" />
          {pending ? 'Backup läuft…' : 'Jetzt sichern'}
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Erstellt ein Excel mit allen Flügen des Monats und legt es im Hauptordner ab.
        Backups älter als 2 Monate werden automatisch gelöscht.
      </p>
      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}
    </div>
  );
}
