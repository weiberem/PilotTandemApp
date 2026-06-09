'use client';

import { useEffect, useState, useTransition } from 'react';
import { CalendarRange, RefreshCw, Lock, Trash2 } from 'lucide-react';
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

  function friendly(error: string | undefined, detail: string | undefined): string {
    const text = detail ?? error ?? 'Import failed.';
    if (/einsatzplan_imports.*does not exist/i.test(text)) {
      return 'Database column missing: please run migration 005 in Supabase ' +
        '(SQL Editor → "alter table pilots add column if not exists einsatzplan_imports jsonb not null default \'\'{}\'\'::jsonb;").';
    }
    return text;
  }

  function importPlan(month: string, link: string) {
    if (!link.trim()) {
      setMsg({ kind: 'err', text: 'Please paste a Drive link.' });
      return;
    }
    setMsg(null);
    setBusyKey(`import:${month}`);
    startTransition(async () => {
      const r = await fetch('/api/einsatzplan/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, drive_link: link.trim() }),
      });
      const data = await r.json();
      setBusyKey(null);
      if (!r.ok) {
        setMsg({ kind: 'err', text: friendly(data.error, data.detail) });
        return;
      }
      setMsg({ kind: 'ok', text: `${data.days} days imported${data.file_name ? ` (${data.file_name})` : ''}.` });
      reload();
    });
  }

  function resetPlan(month: string) {
    const clearCal = window.confirm(
      `Reset schedule for ${monthKeyLabel(month)}.\n\n` +
      `Should the Skywings entries for this month also be deleted from Google Calendar?\n\n` +
      `OK = yes, delete both\nCancel = only delete app data`,
    );
    setMsg(null);
    setBusyKey(`reset:${month}`);
    startTransition(async () => {
      const r = await fetch('/api/einsatzplan/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, clear_calendar: clearCal }),
      });
      const data = await r.json();
      setBusyKey(null);
      if (!r.ok) {
        setMsg({ kind: 'err', text: friendly(data.error, data.detail) });
        return;
      }
      const calNote = clearCal
        ? data.warning
          ? ` (calendar cleanup: ${data.warning})`
          : ` · ${data.calendar_deleted} calendar entries deleted`
        : '';
      setMsg({ kind: 'ok', text: `Schedule for ${monthKeyLabel(month)} reset.${calNote}` });
      reload();
    });
  }

  if (!status) {
    return (
      <div className="card p-4 text-sm text-text-muted">
        <CalendarRange className="w-4 h-4 inline mr-2" />
        Loading schedule status…
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarRange className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold">Schedule imports</h2>
      </div>
      <p className="text-xs text-text-muted">
        Paste the Drive link for each month. Data appears in the calendar, in stats, and in the Google Calendar push.
      </p>

      <PlanSlot
        title={`Current month — ${monthKeyLabel(status.current_month)}`}
        month={status.current_month}
        slot={status.current}
        busyImport={busyKey === `import:${status.current_month}` && pending}
        busyReset={busyKey === `reset:${status.current_month}` && pending}
        onImport={(link) => importPlan(status.current_month, link)}
        onReset={() => resetPlan(status.current_month)}
      />
      <PlanSlot
        title={`Upcoming month — ${monthKeyLabel(status.next_month)}`}
        month={status.next_month}
        slot={status.next}
        busyImport={busyKey === `import:${status.next_month}` && pending}
        busyReset={busyKey === `reset:${status.next_month}` && pending}
        onImport={(link) => importPlan(status.next_month, link)}
        onReset={() => resetPlan(status.next_month)}
      />

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}
    </div>
  );
}

function PlanSlot({
  title, month, slot, busyImport, busyReset, onImport, onReset,
}: {
  title: string;
  month: string;
  slot: Slot;
  busyImport: boolean;
  busyReset: boolean;
  onImport: (link: string) => void;
  onReset: () => void;
}) {
  const [link, setLink] = useState(slot?.drive_link ?? '');

  useEffect(() => {
    if (slot?.drive_link && !link) setLink(slot.drive_link);
  }, [slot?.drive_link]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-lg border border-border bg-bg/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {slot?.archived && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
            <Lock className="w-3 h-3" /> Archive
          </span>
        )}
      </div>

      {slot && (
        <div className="text-xs text-text-muted">
          {slot.days} days · last imported {formatDateDe(slot.last_synced_at, {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
          {slot.file_name && <> · {slot.file_name}</>}
        </div>
      )}

      <input
        type="text"
        value={link}
        onChange={(e) => setLink(extractDriveId(e.target.value))}
        placeholder="Paste Drive link or file ID"
        disabled={slot?.archived || busyImport || busyReset}
        className="w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono text-xs disabled:opacity-50"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onImport(link)}
          disabled={slot?.archived || busyImport || busyReset || !link.trim()}
          className="btn-primary flex-1"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${busyImport ? 'animate-spin' : ''}`} />
          {busyImport ? 'Importing…' : slot ? 'Import again' : `Import schedule for ${month}`}
        </button>
        {slot && !slot.archived && (
          <button
            type="button"
            onClick={onReset}
            disabled={busyImport || busyReset}
            className="btn-ghost border border-danger/30 text-danger min-w-tap"
            aria-label="Reset schedule"
            title="Reset schedule"
          >
            <Trash2 className={`w-4 h-4 ${busyReset ? 'animate-pulse' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}
