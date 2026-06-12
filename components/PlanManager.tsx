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
    const label = monthKeyLabel(month);
    const proceed = window.confirm(
      `Reset the schedule for ${label}?\n\n` +
      `This clears the imported plan so you can import a fresh file (e.g. an updated version from Skywings). Your own availability and your flights are NOT affected.\n\n` +
      `Tap OK to continue, Cancel to keep the current import.`,
    );
    if (!proceed) return;
    const clearCal = window.confirm(
      `Also delete the Skywings calendar entries for ${label} from your Google Calendar?\n\n` +
      `OK = delete calendar entries too\nCancel = keep them (only clear app data)`,
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
      setMsg({ kind: 'ok', text: `Schedule for ${label} reset.${calNote} You can now import a new file.` });
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
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 bg-danger/5 text-danger px-3 min-h-tap text-sm font-medium hover:bg-danger/10"
            aria-label="Reset and re-import"
            title="Clear this month's import (data + optional calendar entries) so you can import a fresh file"
          >
            <Trash2 className={`w-4 h-4 ${busyReset ? 'animate-pulse' : ''}`} />
            <span>Reset</span>
          </button>
        )}
      </div>
      {slot && !slot.archived && (
        <p className="text-[11px] text-text-muted">
          Wrong import or new plan from Skywings? Reset to clear this month,
          then paste the new Drive link and Import.
        </p>
      )}
    </div>
  );
}
