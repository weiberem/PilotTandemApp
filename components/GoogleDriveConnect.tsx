'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, RefreshCw, Unlink } from 'lucide-react';

type Props = {
  connected: boolean;
  lastSyncedAt: string | null;
  hasFileId: boolean;
};

export function GoogleDriveConnect({ connected, lastSyncedAt, hasFileId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function sync() {
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/gdrive/sync', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.error ?? 'Sync fehlgeschlagen' });
        return;
      }
      setMsg({ kind: 'ok', text: `Synchronisiert: ${data.days} Tage` });
      router.refresh();
    });
  }

  async function disconnect() {
    if (!confirm('Google Drive trennen?')) return;
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/gdrive/disconnect', { method: 'POST' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setMsg({ kind: 'err', text: data.error ?? 'Fehler' });
        return;
      }
      setMsg({ kind: 'ok', text: 'Verbindung getrennt.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {connected ? (
        <>
          <div className="text-xs text-text-muted">
            ✓ Verbunden{lastSyncedAt ? ` · zuletzt synchronisiert ${new Date(lastSyncedAt).toLocaleString('de-CH')}` : ''}
          </div>
          <div className="flex gap-2">
            <button
              type="button" onClick={sync}
              disabled={pending || !hasFileId}
              className="btn-primary flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> {pending ? 'Synchronisiere…' : 'Einsatzplan synchronisieren'}
            </button>
            <button type="button" onClick={disconnect} disabled={pending} className="btn-ghost border border-border">
              <Unlink className="w-4 h-4" />
            </button>
          </div>
          {!hasFileId && (
            <p className="text-xs text-warning">Bitte Einsatzplan-Datei-ID oben hinterlegen, um zu synchronisieren.</p>
          )}
        </>
      ) : (
        <a href="/api/gdrive/auth/start" className="btn-primary w-full inline-flex">
          <Cloud className="w-4 h-4 mr-2" /> Google Drive verbinden
        </a>
      )}
      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-xs' : 'text-danger text-xs'}>{msg.text}</p>
      )}
    </div>
  );
}
