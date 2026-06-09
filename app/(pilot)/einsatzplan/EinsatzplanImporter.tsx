'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertTriangle, Trash2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentTripTimes, resolveSeason } from '@/lib/tripTimes';

type Period = 'full' | 'half_am' | 'half_pm';
type Entry = { period: Period; times: string[] };
type Schedule = Record<string, Entry>;

const PERIOD_LABEL: Record<Period, string> = {
  full: 'Full day',
  half_am: '½ Morning',
  half_pm: '½ Afternoon',
};

export function EinsatzplanImporter({
  seasonOverride,
}: { seasonOverride: 'summer' | 'winter' | null }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{
    file_id: string;
    file_name: string;
    schedule: Schedule;
  } | null>(null);
  const [edited, setEdited] = useState<Schedule>({});
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const sortedDates = useMemo(() => Object.keys(edited).sort(), [edited]);
  const stats = useMemo(() => {
    const out = { full: 0, half_am: 0, half_pm: 0 };
    for (const e of Object.values(edited)) out[e.period]++;
    return out;
  }, [edited]);

  async function fetchPreview() {
    setMsg(null);
    setPreview(null);
    setEdited({});
    startTransition(async () => {
      const r = await fetch('/api/gdrive/parse-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url_or_id: url.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ kind: 'err', text: friendlyError(data.error) });
        return;
      }
      setPreview({ file_id: data.file_id, file_name: data.file_name, schedule: data.schedule });
      setEdited(data.schedule);
      const dayCount = Object.keys(data.schedule).length;
      if (dayCount === 0) {
        setMsg({ kind: 'warn', text: 'File read, but 0 shifts found for you. Check the column name in the Excel.' });
      } else {
        setMsg({ kind: 'ok', text: `${dayCount} days detected. Please review.` });
      }
    });
  }

  function setEntry(date: string, period: Period | null) {
    setEdited(prev => {
      const next = { ...prev };
      if (!period) {
        delete next[date];
        return next;
      }
      const season = resolveSeason(seasonOverride, new Date(date));
      const all = [...getCurrentTripTimes(season)];
      const half = Math.ceil(all.length / 2);
      const baseTimes = period === 'half_am' ? all.slice(0, half)
        : period === 'half_pm' ? all.slice(half)
        : all;
      // Preserve previous exclusions if present.
      const prevTimes = next[date]?.times ?? baseTimes;
      const keep = baseTimes.filter(t => prevTimes.includes(t) || !next[date]);
      next[date] = { period, times: keep.length > 0 ? keep : baseTimes };
      return next;
    });
  }

  function toggleExclude(date: string, time: string) {
    setEdited(prev => {
      const e = prev[date];
      if (!e) return prev;
      const has = e.times.includes(time);
      const next = has ? e.times.filter(t => t !== time) : [...e.times, time].sort();
      return { ...prev, [date]: { ...e, times: next } };
    });
  }

  async function commit() {
    if (!preview) return;
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/einsatzplan/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schedule: edited,
          file_id: preview.file_id,
          file_name: preview.file_name,
          mode: 'merge',
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.error });
        return;
      }
      setMsg({ kind: 'ok', text: `Saved. ${data.days} days total in your schedule.` });
      setPreview(null);
      setEdited({});
      setUrl('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Drive link or file ID</span>
          <input
            type="text" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/…"
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono text-sm"
          />
          <span className="text-xs text-text-muted mt-1 block">
            In Drive, on the file → "Copy link" → paste here.
          </span>
        </label>
        <button
          type="button" onClick={fetchPreview}
          disabled={busy || !url.trim()}
          className="btn-primary w-full"
        >
          <Search className="w-4 h-4 mr-2" />
          {busy ? 'Reading file…' : 'Create preview'}
        </button>
      </div>

      {msg && (
        <div className={cn(
          'card p-3 border-l-4 text-sm flex items-start gap-2',
          msg.kind === 'ok' && 'border-l-success',
          msg.kind === 'warn' && 'border-l-warning',
          msg.kind === 'err' && 'border-l-danger',
        )}>
          {msg.kind === 'ok' ? <Check className="w-4 h-4 text-success mt-0.5" />
            : <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="card p-3 text-xs text-text-muted">
            File: <span className="font-mono text-text">{preview.file_name}</span>
            {' · '}
            <button onClick={() => { setEdited(preview.schedule); }} className="text-primary">
              Reset to preview
            </button>
          </div>

          <div className="flex gap-4 text-xs text-text-muted">
            <span>{stats.full} full day</span>
            <span>{stats.half_am} ½ AM</span>
            <span>{stats.half_pm} ½ PM</span>
          </div>

          <ul className="space-y-2">
            {sortedDates.length === 0 ? (
              <li className="card p-4 text-text-muted text-sm text-center">No days read.</li>
            ) : sortedDates.map(date => (
              <DayRow
                key={date}
                date={date}
                entry={edited[date]}
                seasonOverride={seasonOverride}
                onSetPeriod={(p) => setEntry(date, p)}
                onToggleTime={(t) => toggleExclude(date, t)}
              />
            ))}
          </ul>

          <AddDayRow
            existing={new Set(sortedDates)}
            seasonOverride={seasonOverride}
            onAdd={(date, period) => setEntry(date, period)}
          />

          <div className="card p-4 flex flex-wrap gap-2 items-center justify-between sticky bottom-20 lg:bottom-4 bg-bg-card/95 backdrop-blur">
            <span className="text-sm text-text-muted">
              {sortedDates.length} day{sortedDates.length === 1 ? '' : 's'} ready to save
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setPreview(null); setEdited({}); }}
                className="btn-ghost border border-border"
              >Cancel</button>
              <button
                onClick={commit}
                disabled={busy || sortedDates.length === 0}
                className="btn-accent"
              >
                {busy ? 'Saving…' : `Save${sortedDates.length > 0 ? ` (${sortedDates.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayRow({
  date, entry, seasonOverride, onSetPeriod, onToggleTime,
}: {
  date: string;
  entry: Entry;
  seasonOverride: 'summer' | 'winter' | null;
  onSetPeriod: (p: Period | null) => void;
  onToggleTime: (t: string) => void;
}) {
  const [, m, d] = date.split('-');
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(date));
  const season = resolveSeason(seasonOverride, new Date(date));
  const all = [...getCurrentTripTimes(season)];

  return (
    <li className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono">{d}.{m}.</span>
          <span className="text-text-muted text-xs ml-2">{weekday}</span>
        </div>
        <button
          onClick={() => onSetPeriod(null)}
          className="text-text-muted hover:text-danger"
          aria-label="Remove day"
        ><Trash2 className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-bg p-1 border border-border">
        {(['full', 'half_am', 'half_pm'] as Period[]).map(p => (
          <button
            key={p} type="button"
            onClick={() => onSetPeriod(p)}
            aria-pressed={entry.period === p}
            className={cn(
              'min-h-tap rounded-md text-xs font-medium transition',
              entry.period === p
                ? 'bg-white text-text shadow-sm border border-border'
                : 'text-text-muted',
            )}
          >{PERIOD_LABEL[p]}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {all.map(t => {
          const active = entry.times.includes(t);
          return (
            <button
              key={t} type="button"
              onClick={() => onToggleTime(t)}
              className={cn(
                'font-mono text-xs px-2 py-1 rounded-md border transition',
                active
                  ? 'bg-primary/10 border-primary text-primary-dark'
                  : 'bg-bg border-border text-text-muted line-through',
              )}
            >{t}</button>
          );
        })}
      </div>
    </li>
  );
}

function AddDayRow({
  existing, seasonOverride, onAdd,
}: {
  existing: Set<string>;
  seasonOverride: 'summer' | 'winter' | null;
  onAdd: (date: string, period: Period) => void;
}) {
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState<Period>('full');
  return (
    <details className="card p-3">
      <summary className="text-sm text-text-muted cursor-pointer">+ Add day manually</summary>
      <div className="mt-3 flex gap-2 items-end">
        <label className="block text-xs flex-1">
          <span className="text-text-muted">Date</span>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
          />
        </label>
        <label className="block text-xs">
          <span className="text-text-muted">Period</span>
          <select
            value={period} onChange={e => setPeriod(e.target.value as Period)}
            className="mt-1 min-h-tap rounded-lg border border-border px-3 py-2 bg-white"
          >
            <option value="full">Full day</option>
            <option value="half_am">½ AM</option>
            <option value="half_pm">½ PM</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!date || existing.has(date)}
          onClick={() => { onAdd(date, period); setDate(''); }}
          className="btn-primary"
        >Add</button>
      </div>
      {date && existing.has(date) && (
        <p className="text-xs text-warning mt-1">{date} is already in the list.</p>
      )}
      {void seasonOverride}
    </details>
  );
}

function friendlyError(e: string | undefined): string {
  switch (e) {
    case 'not_connected': return 'Google Drive is not connected. Please connect it in Settings first.';
    case 'invalid_url':   return 'Could not extract a file ID from the link. Please use the "Copy link" link from Drive.';
    case 'unauthenticated': return 'Session expired. Please sign in again.';
    default: return e ?? 'Unknown error';
  }
}
