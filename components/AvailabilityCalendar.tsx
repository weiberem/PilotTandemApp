'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Mail, Check, Plane } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addMonths, buildMailto, monthGrid, monthLabel, monthFirst, periodLabel,
  type AvailabilityDay, type DayPeriod,
} from '@/lib/availability';
import { resolveSeason } from '@/lib/tripTimes';
import { saveAvailability } from '@/app/(pilot)/availability/actions';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export type ScheduleMap = Record<string, { period: DayPeriod; times: string[] }>;

const PERIOD_SHORT: Record<DayPeriod, string> = {
  full: 'Ganztag', half_am: '½ Vormittag', half_pm: '½ Nachmittag',
};

type Props = {
  pilotName: string;
  officeEmail: string | null;
  seasonOverride: 'summer' | 'winter' | null;
  initialMonth: { year: number; monthIndex0: number };
  initialDaysByMonth: Record<string, AvailabilityDay[]>;
  submittedByMonth: Record<string, boolean>;
  schedule: ScheduleMap;
};

export function AvailabilityCalendar({
  pilotName, officeEmail, seasonOverride, initialMonth, initialDaysByMonth,
  submittedByMonth, schedule,
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
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const monthKey = monthFirst(cursor.year, cursor.monthIndex0);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.monthIndex0), [cursor]);
  const dayMap = daysByMonth[monthKey] ?? {};
  const season = resolveSeason(seasonOverride, new Date(monthKey));
  const submitted = !!submittedByMonth[monthKey];

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
      if (!existing) return prev;
      m[date] = { ...existing, [key]: value };
      return { ...prev, [monthKey]: m };
    });
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
    void persist(true);
    const url = buildMailto({
      to: officeEmail, pilotName,
      year: cursor.year, monthIndex0: cursor.monthIndex0,
      days,
    });
    window.location.href = url;
  }

  useEffect(() => setMsg(null), [monthKey]);

  const hasSchedule = Object.keys(schedule).some(d => d.startsWith(monthKey.slice(0, 7)));

  return (
    <div className="space-y-4">
      {showDeadline && (
        <div className="card p-3 border-l-4 border-l-warning text-sm flex items-start gap-2">
          <span>⚠️</span>
          <span>Verfügbarkeit bis Monatsmitte einreichen!</span>
        </div>
      )}

      {submitted && (
        <div className="card p-3 border-l-4 border-l-success text-sm flex items-center gap-2">
          <Check className="w-4 h-4 text-success" />
          <span>Für diesen Monat bereits an Skywings eingereicht (schraffiert dargestellt).</span>
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(c => addMonths(c.year, c.monthIndex0, -1))}
          className="btn-ghost border border-border min-w-tap" aria-label="Vorheriger Monat"
        ><ChevronLeft className="w-5 h-5" /></button>
        <div className="font-display font-semibold text-lg capitalize">
          {monthLabel(cursor.year, cursor.monthIndex0)}
        </div>
        <button
          onClick={() => setCursor(c => addMonths(c.year, c.monthIndex0, 1))}
          className="btn-ghost border border-border min-w-tap" aria-label="Nächster Monat"
        ><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-xs text-text-muted">
        {WEEKDAYS.map(d => <div key={d} className="text-center py-1">{d}</div>)}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map(({ date, inMonth }) => {
          const entry = dayMap[date];
          const period = entry?.period;
          const hasExcl = entry?.exclude_7am || entry?.exclude_5pm;
          const dayNum = Number(date.slice(-2));
          const sched = schedule[date];
          return (
            <button
              key={date}
              type="button"
              onClick={() => inMonth && setSheetFor(date)}
              disabled={!inMonth}
              className={cn(
                'aspect-square rounded-lg min-h-tap text-sm font-medium relative select-none transition overflow-hidden',
                !inMonth && 'opacity-30',
                inMonth && !period && 'bg-bg border border-border text-text',
                period === 'full' && 'bg-success/85 text-white',
                period === 'half_am' && 'bg-gradient-to-b from-warning/85 to-warning/40 text-white',
                period === 'half_pm' && 'bg-gradient-to-t from-warning/85 to-warning/40 text-white',
                // Skywings scheduled but no own availability set → blue ring so it stands out
                sched && !period && 'ring-2 ring-primary ring-inset',
              )}
            >
              {/* Submitted hatch overlay */}
              {submitted && period && (
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.45) 3px, rgba(255,255,255,0.45) 5px)',
                  }}
                />
              )}
              <span className="relative">{dayNum}</span>
              {/* Skywings scheduled marker */}
              {sched && (
                <Plane className={cn(
                  'absolute bottom-0.5 left-1 w-3 h-3',
                  period ? 'text-white/90' : 'text-primary',
                )} />
              )}
              {hasExcl && <span className="absolute top-0.5 right-1 text-[9px] leading-none">×</span>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
        <Legend swatch="bg-bg border border-border" label="frei" />
        <Legend swatch="bg-success/85" label="Ganztag" />
        <Legend swatch="bg-warning/85" label="½ Tag" />
        <span className="inline-flex items-center gap-1"><Plane className="w-3 h-3 text-primary" /> Skywings-Plan</span>
        <span>▦ eingereicht</span>
        <span>× = kein 07:10/17:00</span>
      </div>

      {!hasSchedule && (
        <p className="text-xs text-text-muted">
          Tipp: Importiere den Skywings-Einsatzplan, damit die geplanten Einsätze (✈) hier erscheinen.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => void persist(false)} disabled={pending} className="btn-ghost flex-1 border border-border">
          {pending ? '…' : 'Speichern'}
        </button>
        <button onClick={onPrepareEmail} disabled={pending} className="btn-primary flex-1">
          <Mail className="w-4 h-4 mr-2" /> E-Mail vorbereiten
        </button>
      </div>

      {msg && (
        <p className={cn('text-sm', msg.kind === 'ok' ? 'text-success' : 'text-danger')}>
          {msg.kind === 'ok' && <Check className="inline w-4 h-4 mr-1" />}{msg.text}
        </p>
      )}

      {sheetFor && (
        <DayOptionsSheet
          date={sheetFor}
          season={season}
          current={dayMap[sheetFor]}
          scheduled={schedule[sheetFor]}
          onSetPeriod={(p) => setDayState(sheetFor, p)}
          onSetExclude={(k, v) => setExclude(sheetFor, k, v)}
          onClose={() => setSheetFor(null)}
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

const NEXT_PERIOD: Record<DayPeriod, DayPeriod> = {
  full: 'half_am', half_am: 'half_pm', half_pm: 'full',
};

function DayOptionsSheet({
  date, season, current, scheduled, onSetPeriod, onSetExclude, onClose,
}: {
  date: string;
  season: 'summer' | 'winter';
  current: AvailabilityDay | undefined;
  scheduled: { period: DayPeriod; times: string[] } | undefined;
  onSetPeriod: (p: DayPeriod | null) => void;
  onSetExclude: (key: 'exclude_7am' | 'exclude_5pm', value: boolean) => void;
  onClose: () => void;
}) {
  const [, m, d] = date.split('-');
  const period = current?.period;
  const isSummer = season === 'summer';

  // Tap the centre tile: if not yet available → set Ganztag; else cycle.
  function onCentreTap() {
    if (!period) onSetPeriod('full');
    else onSetPeriod(NEXT_PERIOD[period]);
  }

  const centreClass =
    period === 'full' ? 'bg-success/85 text-white'
    : period === 'half_am' ? 'bg-gradient-to-b from-warning/85 to-warning/40 text-white'
    : period === 'half_pm' ? 'bg-gradient-to-t from-warning/85 to-warning/40 text-white'
    : 'bg-bg border border-border text-text';

  // Side toggle for an edge time. Active (filled) = pilot flies it.
  function EdgeToggle({
    active, disabled, label, onClick,
  }: { active: boolean; disabled: boolean; label: string; onClick: () => void }) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border w-16 shrink-0 transition select-none',
          disabled && 'opacity-30',
          !disabled && active && 'border-primary bg-primary/10 text-primary-dark',
          !disabled && !active && 'border-border bg-bg text-text-muted line-through',
        )}
      >
        <Plane className="w-4 h-4 mb-1" />
        <span className="text-xs font-mono">{label}</span>
        <span className="text-[10px] mt-0.5">{active ? 'dabei' : 'kein'}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-t-2xl p-4 space-y-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-1 w-10 bg-border rounded-full mx-auto" />
        <h3 className="font-display font-semibold text-center">{d}.{m}.</h3>

        {scheduled && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 text-sm flex items-center gap-2">
            <Plane className="w-4 h-4 text-primary shrink-0" />
            <span>
              <span className="font-medium">Skywings geplant:</span> {PERIOD_SHORT[scheduled.period]}
              {scheduled.times.length > 0 && (
                <span className="text-text-muted"> · {scheduled.times[0]}–{scheduled.times[scheduled.times.length - 1]}</span>
              )}
            </span>
          </div>
        )}

        {/* Rectangular control: 07:10 left · day tile centre · 17:00 right */}
        <div className="flex items-stretch gap-2">
          {isSummer ? (
            <EdgeToggle
              active={!current?.exclude_7am}
              disabled={!period}
              label="07:10"
              onClick={() => onSetExclude('exclude_7am', !current?.exclude_7am ? true : false)}
            />
          ) : <div className="w-16 shrink-0" />}

          <button
            type="button"
            onClick={onCentreTap}
            className={cn(
              'flex-1 rounded-xl min-h-[88px] flex flex-col items-center justify-center font-medium transition',
              centreClass,
            )}
          >
            <span className="text-2xl font-mono leading-none">{d}.{m}.</span>
            <span className="text-sm mt-1">{period ? periodLabel(period) : 'Tippen für Ganztag'}</span>
            {period && <span className="text-[10px] opacity-80 mt-0.5">tippen zum Wechseln</span>}
          </button>

          {isSummer ? (
            <EdgeToggle
              active={!current?.exclude_5pm}
              disabled={!period}
              label="17:00"
              onClick={() => onSetExclude('exclude_5pm', !current?.exclude_5pm ? true : false)}
            />
          ) : <div className="w-16 shrink-0" />}
        </div>

        {isSummer && (
          <p className="text-[11px] text-text-muted text-center">
            07:10 &amp; 17:00 sind standardmässig dabei – antippen zum Abwählen.
          </p>
        )}

        <button
          type="button"
          onClick={() => { onSetPeriod(null); onClose(); }}
          className="w-full min-h-tap rounded-lg border border-border px-3 py-2 text-center text-text-muted"
        >Nicht verfügbar</button>

        <button type="button" onClick={onClose} className="btn-primary w-full">Fertig</button>
      </div>
    </div>
  );
}
