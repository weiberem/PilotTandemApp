'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Mail, Check, Plane, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addMonths, buildMailto, monthGrid, monthLabel, monthFirst, nextDeadlineInfo,
  type AvailabilityDay, type DayPeriod,
} from '@/lib/availability';
import { resolveSeason } from '@/lib/tripTimes';
import { saveAvailability } from '@/app/(pilot)/availability/actions';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export type ScheduleMap = Record<string, { period: DayPeriod; times: string[] }>;

const PERIOD_ABBR: Record<DayPeriod, string> = {
  full: 'GT', half_am: 'VM', half_pm: 'NM',
};

function periodAbbr(p: DayPeriod): string {
  return PERIOD_ABBR[p];
}

/** Cycle a calendar cell: none → full → half_am → half_pm → none. */
function cellCycle(current: DayPeriod | undefined): DayPeriod | null {
  switch (current) {
    case undefined: return 'full';
    case 'full': return 'half_am';
    case 'half_am': return 'half_pm';
    default: return null;
  }
}

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
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthKey = monthFirst(cursor.year, cursor.monthIndex0);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.monthIndex0), [cursor]);
  const dayMap = daysByMonth[monthKey] ?? {};
  const season = resolveSeason(seasonOverride, new Date(monthKey));
  const submitted = !!submittedByMonth[monthKey];

  const deadline = useMemo(() => nextDeadlineInfo(new Date()), []);

  // Tapping a day cycles its period AND selects it (so the edge-time strip
  // below the grid shows for that day). Clearing to "frei" deselects.
  function onDayTap(date: string) {
    const current = dayMap[date]?.period;
    const next = cellCycle(current);
    setDayState(date, next);
    setSelectedDate(next ? date : null);
  }

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
      <div className={cn(
        'card p-3 border-l-4 text-sm flex items-start gap-2',
        deadline.urgent ? 'border-l-warning' : 'border-l-primary',
      )}>
        <AlertTriangle className={cn('w-4 h-4 shrink-0 mt-0.5', deadline.urgent ? 'text-warning' : 'text-primary')} />
        <span>
          Einsatzdaten für <span className="font-semibold capitalize">{deadline.targetMonthLabel}</span>{' '}
          bis <span className="font-semibold">15. {deadline.deadlineMonthLabel}</span> einreichen.
        </span>
      </div>

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
          const dayNum = Number(date.slice(-2));
          const sched = schedule[date];
          const isSelected = selectedDate === date;
          return (
            <div
              key={date}
              role={inMonth ? 'button' : undefined}
              tabIndex={inMonth ? 0 : undefined}
              onClick={() => inMonth && onDayTap(date)}
              onKeyDown={(e) => {
                if (inMonth && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onDayTap(date);
                }
              }}
              className={cn(
                'aspect-square rounded-lg text-sm font-medium relative select-none transition overflow-hidden',
                inMonth && 'cursor-pointer',
                !inMonth && 'opacity-30',
                inMonth && !period && 'bg-bg border border-border text-text',
                period === 'full' && 'bg-success/85 text-white',
                period === 'half_am' && 'bg-gradient-to-b from-warning/85 to-warning/40 text-white',
                period === 'half_pm' && 'bg-gradient-to-t from-warning/85 to-warning/40 text-white',
                sched && !period && 'ring-2 ring-primary ring-inset',
                isSelected && 'outline outline-2 outline-offset-1 outline-accent',
              )}
            >
              {/* Skywings plan half-fill tint (only when no own availability set) */}
              {sched && !period && (
                <span
                  className={cn(
                    'absolute inset-x-0 pointer-events-none bg-primary/15',
                    sched.period === 'full' && 'inset-y-0',
                    sched.period === 'half_am' && 'top-0 h-1/2',
                    sched.period === 'half_pm' && 'bottom-0 h-1/2',
                  )}
                />
              )}
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
              <span className="absolute top-1 left-0 right-0 text-center">{dayNum}</span>
              {(period || sched) && (
                <span className={cn(
                  'absolute bottom-1 inset-x-0 text-center text-[10px] font-semibold leading-none',
                  period ? 'text-white/95' : 'text-primary',
                )}>
                  {periodAbbr(period ?? sched!.period)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Inline edge-time control for the selected day: 07:10 | day | 17:00 */}
      {selectedDate && dayMap[selectedDate]?.period && season === 'summer' && (
        <EdgeTimeStrip
          date={selectedDate}
          entry={dayMap[selectedDate]}
          onToggle7={() => setExclude(selectedDate, 'exclude_7am', !dayMap[selectedDate].exclude_7am)}
          onToggle17={() => setExclude(selectedDate, 'exclude_5pm', !dayMap[selectedDate].exclude_5pm)}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
        <Legend swatch="bg-success/85" label="GT Ganztag" />
        <Legend swatch="bg-warning/85" label="VM / NM Halbtag" />
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded ring-2 ring-primary ring-inset bg-primary/15" /> Skywings geplant
        </span>
      </div>
      <p className="text-xs text-text-muted">
        Tag antippen: frei → Ganztag → ½ Vormittag → ½ Nachmittag.
        {season === 'summer' && ' Darunter erscheinen 07:10 / 17:00 zum Ab- oder Anwählen.'}
      </p>

      {!hasSchedule && (
        <p className="text-xs text-text-muted">
          Tipp: Einsatzplan importieren, damit die von Skywings geplanten Einsätze hier erscheinen.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => void persist(false)} disabled={pending} className="btn-ghost flex-1 border border-border">
          {pending ? 'Speichern…' : 'Speichern'}
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

/** Small tappable edge-time dot in a cell corner. Filled = pilot flies it. */
/**
 * Inline strip shown under the grid for the tapped day:
 *   [ 07:10 toggle ] [ day · period ] [ 17:00 toggle ]
 * Filled/active = pilot flies that edge time; tap to deselect.
 */
function EdgeTimeStrip({
  date, entry, onToggle7, onToggle17,
}: {
  date: string;
  entry: AvailabilityDay;
  onToggle7: () => void;
  onToggle17: () => void;
}) {
  const [, m, d] = date.split('-');
  const fly7 = !entry.exclude_7am;
  const fly17 = !entry.exclude_5pm;
  return (
    <div className="flex items-stretch gap-2">
      <EdgeButton time="07:10" active={fly7} onClick={onToggle7} />
      <div className="flex-1 rounded-xl bg-accent text-white flex flex-col items-center justify-center py-2">
        <span className="font-mono text-base leading-none">{d}.{m}.</span>
        <span className="text-xs mt-1 opacity-90">{PERIOD_FULL[entry.period]}</span>
      </div>
      <EdgeButton time="17:00" active={fly17} onClick={onToggle17} />
    </div>
  );
}

const PERIOD_FULL: Record<DayPeriod, string> = {
  full: 'Ganztag', half_am: '½ Vormittag', half_pm: '½ Nachmittag',
};

function EdgeButton({
  time, active, onClick,
}: { time: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-20 shrink-0 rounded-xl border-2 flex flex-col items-center justify-center py-2 transition',
        active
          ? 'border-primary bg-primary/10 text-primary-dark'
          : 'border-border bg-bg text-text-muted',
      )}
    >
      <span className="font-mono text-sm font-semibold">{time}</span>
      <span className="text-[11px] mt-0.5">{active ? 'dabei' : 'kein'}</span>
    </button>
  );
}
