'use client';

import { useEffect, useState, useTransition } from 'react';
import { CalendarRange, RefreshCw, Lock } from 'lucide-react';
import { extractDriveId, formatDateDe } from '@/lib/utils';
import { monthKeyLabel } from '@/lib/einsatzplanImports';

type Slot = {
  drive_link: string;
  file_name: string | null;
  last_synced_at: string;
  archived: boolean;
  days: number;
} | null;

type Status = { current_month: string; next_month: string; current: Slot; next: Slot };

export function PlanManager() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function reload() {
    const r = await fetch('/api/einsatzplan/import');
    if (r.ok) setStatus(await r.json());
  }
  useEffect(() => { reload(); }, []);

  function importPlan(month: string, link: string) {
    if (!link.trim()) {
      setMsg({ kind: 'err', text: 'Bitte Drive-Link einfügen.' });
      return;
    }
    setMsg(null);
    setBusyKey(month);
    startTransition(async () => {
      const r = await fetch('/api/einsatzplan/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, drive_link: link.trim() }),
      });
      const data = await r.json();
      setBusyKey(null);
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.detail ?? data.error ?? 'Import fehlgeschlagen.' });
        return;
      }
      setMsg({ kind: 'ok', text: `${data.days} Tage importiert${data.file_name ? ` (${data.file_name})` : ''}.` });
      reload();
    });
  }

  if (!status) {
    return (
      <div className="card p-4 text-sm text-text-muted">
        <CalendarRange className="w-4 h-4 inline mr-2" />
        Lade Einsatzplan-Status…
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarRange className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold">Einsatzplan-Importe</h2>
      </div>
      <p className="text-xs text-text-muted">
        Pro Monat den Drive-Link einfügen. Daten landen im Kalender, in den Stats und im Google-Kalender-Push.
      </p>

      <PlanSlot
        title={`Aktueller Monat — ${monthKeyLabel(status.current_month)}`}
        month={status.current_month}
        slot={status.current}
        busy={busyKey === status.current_month && pending}
        onImport={(link) => importPlan(status.current_month, link)}
      />
      <PlanSlot
        title={`Kommender Monat — ${monthKeyLabel(status.next_month)}`}
        month={status.next_month}
        slot={status.next}
        busy={busyKey === status.next_month && pending}
        onImport={(link) => importPlan(status.next_month, link)}
      />

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}
    </div>
  );
}

function PlanSlot({
  title, month, slot, busy, onImport,
}: {
  title: string;
  month: string;
  slot: Slot;
  busy: boolean;
  onImport: (link: string) => void;
}) {
  const [link, setLink] = useState(slot?.drive_link ?? '');

  // Keep the input in sync if the slot was just refreshed.
  useEffect(() => {
    if (slot?.drive_link && !link) setLink(slot.drive_link);
  }, [slot?.drive_link]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-lg border border-border bg-bg/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {slot?.archived && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
            <Lock className="w-3 h-3" /> Archiv
          </span>
        )}
      </div>

      {slot && (
        <div className="text-xs text-text-muted">
          {slot.days} Tage · zuletzt importiert {formatDateDe(slot.last_synced_at, {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
          {slot.file_name && <> · {slot.file_name}</>}
        </div>
      )}

      <input
        type="text"
        value={link}
        onChange={(e) => setLink(extractDriveId(e.target.value))}
        placeholder="Drive-Link oder Datei-ID einfügen"
        disabled={slot?.archived || busy}
        className="w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono text-xs disabled:opacity-50"
      />

      <button
        type="button"
        onClick={() => onImport(link)}
        disabled={slot?.archived || busy || !link.trim()}
        className="btn-primary w-full"
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Importiere…' : slot ? 'Erneut importieren' : `Plan für ${month} importieren`}
      </button>
    </div>
  );
}
