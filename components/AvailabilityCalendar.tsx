'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Mail, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addMonths, buildMailto, monthGrid, monthLabel, monthFirst, periodLabel,
  type AvailabilityDay, type DayPeriod,
} from '@/lib/availability';
import { resolveSeason } from '@/lib/tripTimes';
import { saveAvailability } from '@/app/(pilot)/availability/actions';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const CYCLE: (DayPeriod | null)[] = [null, 'full', 'half_am', 'half_pm'];

type Props = {
  pilotName: string;
  officeEmail: string | null;
  seasonOverride: 'summer' | 'winter' | null;
  initialMonth: { year: number; monthIndex0: number };
  initialDaysByMonth: Record<string, AvailabilityDay[]>; // keyed by YYYY-MM-01
};

export function AvailabilityCalendar({
  pilotName, officeEmail, seasonOverride, initialMonth, initialDaysByMonth,
}: Props) {
  const [cursor, setCursor] = useState(initialMonth);
  const [daysByMonth, setDaysByMonth] = useState<Record<string, Record<string, AvailabilityDay>>>(() => {
    const out: Record<string, Record<string, AvailabilityDay>> = {};
    for (const [m, arr] of Object.entries(initialDaysByMonth)) {
      out[m] = {};
      for (const d of arr) out[m][d.date] = d;
    }
    return out;
  });
  const [longPressFor, setLongPressFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const monthKey = monthFirst(cursor.year, cursor.monthIndex0);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.monthIndex0), [cursor]);
  const dayMap = daysByMonth[monthKey] ?? {};
  const season = resolveSeason(seasonOverride, new Date(monthKey));

  // Deadline banner from 10th of current real-time month.
  const todayDom = new Date().getDate();
  const showDeadline = todayDom >= 10;

  function setDayState(date: string, period: DayPeriod | null) {
    setDaysByMonth(prev => {
      const m = { ...(prev[monthKey] ?? {}) };
      if (period == null) {
        delete m[date];
      } else {
        const existing = m[date];
        m[date] = {
          date,
          period,
          exclude_7am: existing?.exclude_7am,
          exclude_5pm: existing?.exclude_5pm,
        };
      }
      return { ...prev, [monthKey]: m };
    });
  }

  function setExclude(date: string, key: 'exclude_7am' | 'exclude_5pm', value: boolean) {
    setDaysByMonth(prev => {
      const m = { ...(prev[monthKey] ?? {}) };
      const existing = m[date];
      if (!existing) return prev; // must have period first
      m[date] = { ...existing, [key]: value };
      return { ...prev, [monthKey]: m };
    });
  }

  function onTapCycle(date: string) {
    const current = dayMap[date]?.period ?? null;
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    setDayState(date, next);
  }

  function startLongPress(date: string) {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => setLongPressFor(date), 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  async function persist(markSubmitted = false) {
    setMsg(null);
    const days = Object.values(dayMap);
    startTransition(async () => {
      const r = await saveAvailability({ month: monthKey, days, mark_submitted: markSubmitted });
      setMsg(r.ok
        ? { kind: 'ok', text: markSubmitted ? 'Eingereicht.' : 'Gespeichert.' }
        : { kind: 'err', text: r.error });
    });
  }

  function onPrepareEmail() {
    if (!officeEmail) {
      setMsg({ kind: 'err', text: 'Bitte zuerst Office-E-Mail in den Einstellungen hinterlegen.' });
      return;
    }
    const days = Object.values(dayMap);
    if (days.length === 0) {
      setMsg({ kind: 'err', text: 'Keine Verfügbarkeit eingetragen.' });
      return;
    }
    // Save first (silent), then open mailto and mark as submitted.
    void persist(true);
    const url = buildMailto({
      to: officeEmail, pilotName,
      year: cursor.year, monthIndex0: cursor.monthIndex0,
      days,
    });
    window.location.href = url;
  }

  // Reset message when month changes
  useEffect(() => setMsg(null), [monthKey]);

  return (
    <div className="space-y-4">
      {showDeadline && (
        <div className="card p-3 border-l-4 border-l-warning text-sm flex items-start gap-2">
          <span>⚠️</span>
          <span>Verfügbarkeit bis Monatsmitte einreichen!</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(c => addMonths(c.year, c.monthIndex0, -1))}
          className="btn-ghost border border-border min-w-tap" aria-label="Vorheriger Monat"
        ><ChevronLeft className="w-5 h-5" /></button>
        <div className="font-display font-semibold text-lg capitalize">
          {monthLabel(cursor.year, cursor.monthIndex0)}
        </div>
        <button
          type="button"
          onClick={() => setCursor(c => addMonths(c.year, c.monthIndex0, 1))}
          className="btn-ghost border border-border min-w-tap" aria-label="Nächster Monat"
        ><ChevronRight className="w-5 h-5" /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-text-muted">
        {WEEKDAYS.map(d => <div key={d} className="text-center py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map(({ date, inMonth }) => {
          const entry = dayMap[date];
          const period = entry?.period;
          const hasExcl = entry?.exclude_7am || entry?.exclude_5pm;
          const dayNum = Number(date.slice(-2));
          return (
            <button
              key={date}
              type="button"
              onClick={() => inMonth && onTapCycle(date)}
              onPointerDown={() => inMonth && startLongPress(date)}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onContextMenu={(e) => { e.preventDefault(); if (inMonth) setLongPressFor(date); }}
              disabled={!inMonth}
              className={cn(
                'aspect-square rounded-lg min-h-tap text-sm font-medium relative select-none transition',
                !inMonth && 'opacity-30',
                inMonth && !period && 'bg-bg border border-border text-text',
                period === 'full' && 'bg-success/85 text-white',
                period === 'half_am' && 'bg-gradient-to-b from-warning/85 to-warning/40 text-white',
                period === 'half_pm' && 'bg-gradient-to-t from-warning/85 to-warning/40 text-white',
              )}
            >
              <span>{dayNum}</span>
              {hasExcl && <span className="absolute top-0.5 right-1 text-[9px]">×</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
        <Legend swatch="bg-bg border border-border" label="frei" />
        <Legend swatch="bg-success/85" label="Ganztag" />
        <Legend swatch="bg-warning/85" label="½ Tag" />
        <span>× = Ausnahme</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => void persist(false)}
          disabled={pending}
          className="btn-ghost flex-1 border border-border"
        >{pending ? '…' : 'Speichern'}</button>
        <button
          onClick={onPrepareEmail}
          disabled={pending}
          className="btn-primary flex-1"
        ><Mail className="w-4 h-4 mr-2" /> E-Mail vorbereiten</button>
      </div>

      {msg && (
        <p className={cn('text-sm', msg.kind === 'ok' ? 'text-success' : 'text-danger')}>
          {msg.kind === 'ok' && <Check className="inline w-4 h-4 mr-1" />}{msg.text}
        </p>
      )}

      {longPressFor && (
        <DayOptionsSheet
          date={longPressFor}
          season={season}
          current={dayMap[longPressFor]}
          onSetPeriod={(p) => { setDayState(longPressFor, p); }}
          onSetExclude={(k, v) => setExclude(longPressFor, k, v)}
          onClose={() => setLongPressFor(null)}
        />
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('w-3 h-3 rounded', swatch)} /> {label}
    </span>
  );
}

function DayOptionsSheet({
  date, season, current, onSetPeriod, onSetExclude, onClose,
}: {
  date: string;
  season: 'summer' | 'winter';
  current: AvailabilityDay | undefined;
  onSetPeriod: (p: DayPeriod | null) => void;
  onSetExclude: (key: 'exclude_7am' | 'exclude_5pm', value: boolean) => void;
  onClose: () => void;
}) {
  const [, m, d] = date.split('-');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-t-2xl p-4 space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-1 w-10 bg-border rounded-full mx-auto" />
        <h3 className="font-display font-semibold text-center">{d}.{m}.</h3>

        {(['full', 'half_am', 'half_pm'] as DayPeriod[]).map(p => (
          <button
            key={p} type="button"
            onClick={() => { onSetPeriod(p); }}
            className={cn(
              'w-full min-h-tap rounded-lg border px-3 py-2 text-left',
              current?.period === p ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >{periodLabel(p)}</button>
        ))}

        {season === 'summer' && current?.period && (
          <div className="pt-2 border-t border-border space-y-2">
            <Check2
              checked={!!current.exclude_7am}
              onChange={v => onSetExclude('exclude_7am', v)}
              label="Kein 07:10 Flug"
            />
            <Check2
              checked={!!current.exclude_5pm}
              onChange={v => onSetExclude('exclude_5pm', v)}
              label="Kein 17:00 Flug"
            />
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => { onSetPeriod(null); onClose(); }}
            className="w-full min-h-tap rounded-lg border border-border px-3 py-2 text-left text-text-muted"
          >Nicht verfügbar</button>
        </div>

        <button type="button" onClick={onClose} className="btn-ghost w-full mt-2">Fertig</button>
      </div>
    </div>
  );
}

function Check2({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between min-h-tap px-1 cursor-pointer">
      <span>{label}</span>
      <input
        type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-5 h-5 accent-primary"
      />
    </label>
  );
}
