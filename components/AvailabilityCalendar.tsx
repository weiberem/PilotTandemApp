'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Mail, Check, AlertTriangle, Users, X, RotateCcw, CalendarPlus, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addMonths, buildMailto, buildMailtoInverted, buildAvailabilityIcs,
  monthGrid, monthLabel, monthFirst, nextDeadlineInfo,
  type AvailabilityDay, type DayPeriod,
} from '@/lib/availability';
import { resolveSeason } from '@/lib/tripTimes';
import { isoDateZurich, nowInZurich } from '@/lib/utils';
import { saveAvailability, resetSubmission } from '@/app/(pilot)/availability/actions';
import type { FullPlan, FullPlanPilot } from '@/lib/einsatzplanParser';

export type FullPlansByMonth = Record<string, FullPlan>;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type ScheduleMap = Record<string, { period: DayPeriod; times: string[] }>;

const PERIOD_ABBR: Record<DayPeriod, string> = {
  full: 'FD', half_am: 'AM', half_pm: 'PM',
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

type Mode = 'own' | 'plan';

type Props = {
  pilotName: string;
  officeEmail: string | null;
  seasonOverride: 'summer' | 'winter' | null;
  initialMonth: { year: number; monthIndex0: number };
  initialDaysByMonth: Record<string, AvailabilityDay[]>;
  submittedByMonth: Record<string, boolean>;
  schedule: ScheduleMap;
  fullPlansByMonth: FullPlansByMonth;
};

// Pilot-count thresholds for the "Einsatzplan"-mode tile colour.
// Below LOW = red, below OK = amber, else neutral. Adjust later if needed.
const LOW_THRESHOLD = 8;
const OK_THRESHOLD = 11;

export function AvailabilityCalendar({
  pilotName, officeEmail, seasonOverride, initialMonth, initialDaysByMonth,
  submittedByMonth, schedule, fullPlansByMonth,
}: Props) {
  const [mode, setMode] = useState<Mode>('own');
  const [planDate, setPlanDate] = useState<string | null>(null);
  const [cursor, setCursor] = useState(initialMonth);
  // Inverted entry: pilot marks the days they are NOT available; on apply,
  // everything else in the month becomes a full-day availability.
  const [invert, setInvert] = useState(false);
  const [freeSet, setFreeSet] = useState<Set<string>>(new Set());
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

  // Today in Europe/Zurich — past days in the *current* month are hidden
  // (Skywings does the same in their plan).
  const today = isoDateZurich();
  const todayMonthKey = today.slice(0, 7); // YYYY-MM
  const isPastDay = (date: string): boolean =>
    monthKey.slice(0, 7) === todayMonthKey && date < today;
  // Reference for the nowInZurich helper so future tweaks have it handy.
  void nowInZurich;

  const deadline = useMemo(() => nextDeadlineInfo(new Date()), []);

  // Tapping a day cycles its period AND selects it (so the edge-time strip
  // below the grid shows for that day). Clearing to "frei" deselects.
  // In invert mode a tap toggles the day's membership in the free-set instead.
  function onDayTap(date: string) {
    if (invert) {
      setFreeSet(prev => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date); else next.add(date);
        return next;
      });
      return;
    }
    const current = dayMap[date]?.period;
    const next = cellCycle(current);
    setDayState(date, next);
    setSelectedDate(next ? date : null);
  }

  /** Apply invert selection: all future in-month days except freeSet → full day. */
  function applyInvert() {
    const updates: Record<string, AvailabilityDay> = {};
    for (const { date, inMonth } of grid) {
      if (!inMonth || isPastDay(date) || freeSet.has(date)) continue;
      updates[date] = dayMap[date] ?? { date, period: 'full' };
    }
    setDaysByMonth(prev => ({ ...prev, [monthKey]: updates }));
    setInvert(false);
    setMsg({ kind: 'ok', text: `${Object.keys(updates).length} days marked available — save or prepare the email.` });
  }

  /** Wipe all entered days of this month (and the invert scratchpad). */
  function clearMonth() {
    setDaysByMonth(prev => ({ ...prev, [monthKey]: {} }));
    setFreeSet(new Set());
    setSelectedDate(null);
    startTransition(async () => {
      const r = await saveAvailability({ month: monthKey, days: [] });
      setMsg(r.ok ? { kind: 'ok', text: 'Month cleared.' } : { kind: 'err', text: r.error });
    });
  }

  function onResetSubmission() {
    startTransition(async () => {
      const r = await resetSubmission(monthKey);
      setMsg(r.ok
        ? { kind: 'ok', text: 'Marked as not sent — you can edit and resubmit.' }
        : { kind: 'err', text: r.error });
      if (r.ok) window.location.reload();
    });
  }

  function onExportIcs() {
    const days = Object.values(dayMap);
    if (days.length === 0) {
      setMsg({ kind: 'err', text: 'No availability entered.' });
      return;
    }
    const ics = buildAvailabilityIcs(days, pilotName);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tandem-availability-${monthKey.slice(0, 7)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ kind: 'ok', text: 'Calendar file downloaded — open it to import (Google / iPhone / Android / Outlook).' });
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
        ? { kind: 'ok', text: markSubmitted ? 'Submitted.' : 'Saved.' }
        : { kind: 'err', text: r.error });
    });
  }

  function onPrepareEmail() {
    if (!officeEmail) {
      setMsg({ kind: 'err', text: 'Please set your office email in Settings first.' });
      return;
    }

    if (invert) {
      // Inverted flow: persist all non-free days as full availability and
      // send the email in "available except…" form.
      const updates: Record<string, AvailabilityDay> = {};
      for (const { date, inMonth } of grid) {
        if (!inMonth || isPastDay(date) || freeSet.has(date)) continue;
        updates[date] = dayMap[date] ?? { date, period: 'full' };
      }
      if (Object.keys(updates).length === 0) {
        setMsg({ kind: 'err', text: 'Every day is marked free — nothing to submit.' });
        return;
      }
      setDaysByMonth(prev => ({ ...prev, [monthKey]: updates }));
      startTransition(async () => {
        await saveAvailability({ month: monthKey, days: Object.values(updates), mark_submitted: true });
      });
      window.location.href = buildMailtoInverted({
        to: officeEmail, pilotName,
        year: cursor.year, monthIndex0: cursor.monthIndex0,
        freeDates: [...freeSet],
      });
      setInvert(false);
      return;
    }

    const days = Object.values(dayMap);
    if (days.length === 0) {
      setMsg({ kind: 'err', text: 'No availability entered.' });
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

  // Per-month full plan: keyed by YYYY-MM. Tab is enabled only when the
  // currently-viewed month actually has a plan loaded.
  const planMonthKey = monthKey.slice(0, 7);
  const fullPlan = fullPlansByMonth[planMonthKey] ?? null;
  const planHasMonth = !!fullPlan;
  // Disabling the tab globally would also disable navigating to a month that
  // *does* have a plan, so the tab is enabled if ANY month has a plan and the
  // empty-state banner explains which months are covered.
  const anyMonthHasPlan = Object.keys(fullPlansByMonth).length > 0;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-bg-subtle text-sm">
        <button
          onClick={() => setMode('own')}
          className={cn(
            'min-h-[40px] rounded-md font-medium transition',
            mode === 'own' ? 'bg-white text-text shadow-sm' : 'text-text-muted',
          )}
        >My availability</button>
        <button
          onClick={() => anyMonthHasPlan && setMode('plan')}
          disabled={!anyMonthHasPlan}
          className={cn(
            'min-h-[40px] rounded-md font-medium transition',
            mode === 'plan' ? 'bg-white text-text shadow-sm' : 'text-text-muted',
            !anyMonthHasPlan && 'opacity-40',
          )}
        >Schedule</button>
      </div>

      {mode === 'plan' && !planHasMonth && (
        <div className="card p-3 border-l-4 border-l-warning text-sm">
          No schedule available for {monthLabel(cursor.year, cursor.monthIndex0)}.
          Import the schedule for this month to see the pilot list.
        </div>
      )}

      <div className={cn(
        'card p-3 border-l-4 text-sm flex items-start gap-2',
        deadline.urgent ? 'border-l-warning' : 'border-l-primary',
      )}>
        <AlertTriangle className={cn('w-4 h-4 shrink-0 mt-0.5', deadline.urgent ? 'text-warning' : 'text-primary')} />
        <span>
          Submit availability for <span className="font-semibold capitalize">{deadline.targetMonthLabel}</span>{' '}
          by <span className="font-semibold">{deadline.deadlineMonthLabel} 15</span>.
        </span>
      </div>

      {submitted && (
        <div className="card p-3 border-l-4 border-l-success text-sm flex items-center gap-2">
          <Check className="w-4 h-4 text-success" />
          <span>Already submitted to Skywings for this month (shown hatched).</span>
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(c => addMonths(c.year, c.monthIndex0, -1))}
          className="btn-ghost border border-border min-w-tap" aria-label="Previous month"
        ><ChevronLeft className="w-5 h-5" /></button>
        <div className="font-display font-semibold text-lg capitalize">
          {monthLabel(cursor.year, cursor.monthIndex0)}
        </div>
        <button
          onClick={() => setCursor(c => addMonths(c.year, c.monthIndex0, 1))}
          className="btn-ghost border border-border min-w-tap" aria-label="Next month"
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
          const planDay = fullPlan?.days?.[date];
          const count = planDay?.pilots.length ?? 0;
          const isPlanMode = mode === 'plan';
          const past = inMonth && isPastDay(date);

          if (isPlanMode) {
            // Skywings plan mode: show pilot count tinted by threshold; tap → list.
            const colour =
              !planDay
                ? 'bg-bg border border-border text-text-muted'
                : count <= LOW_THRESHOLD
                ? 'bg-danger/15 border-2 border-danger text-danger'
                : count < OK_THRESHOLD
                ? 'bg-warning/15 border-2 border-warning text-warning'
                : 'bg-success/10 border border-success/30 text-text';
            return (
              <button
                key={date}
                type="button"
                onClick={() => inMonth && !past && planDay && setPlanDate(date)}
                disabled={!inMonth || !planDay || past}
                className={cn(
                  'aspect-square rounded-lg text-sm font-medium relative select-none transition overflow-hidden',
                  inMonth && planDay && !past && 'cursor-pointer hover:brightness-95',
                  !inMonth && 'opacity-30',
                  past && 'opacity-20',
                  colour,
                )}
              >
                <span className="absolute top-1 left-0 right-0 text-center text-text">{dayNum}</span>
                {planDay && (
                  <span className="absolute bottom-1 inset-x-0 text-center text-base font-mono font-semibold leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          }

          // Invert-entry mode: tap marks a day "free" (not available).
          if (invert) {
            const isFree = freeSet.has(date);
            return (
              <div
                key={date}
                role={inMonth && !past ? 'button' : undefined}
                tabIndex={inMonth && !past ? 0 : undefined}
                onClick={() => inMonth && !past && onDayTap(date)}
                onKeyDown={(e) => {
                  if (inMonth && !past && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onDayTap(date);
                  }
                }}
                className={cn(
                  'aspect-square rounded-lg text-sm font-medium relative select-none transition overflow-hidden',
                  inMonth && !past && 'cursor-pointer',
                  !inMonth && 'opacity-30',
                  past && 'opacity-20 pointer-events-none',
                  isFree
                    ? 'bg-danger/80 text-white'
                    : 'bg-success/15 border border-success/30 text-text',
                )}
              >
                <span className="absolute top-1 left-0 right-0 text-center">{dayNum}</span>
                <span className="absolute bottom-1 inset-x-0 text-center text-[10px] font-semibold leading-none">
                  {isFree ? 'free' : ''}
                </span>
              </div>
            );
          }

          // Once the office schedule for this month is imported, scheduled
          // days render solid ("confirmed") instead of the hatched submitted
          // look.
          const officeConfirmed = !!sched;

          return (
            <div
              key={date}
              role={inMonth && !past ? 'button' : undefined}
              tabIndex={inMonth && !past ? 0 : undefined}
              onClick={() => inMonth && !past && onDayTap(date)}
              onKeyDown={(e) => {
                if (inMonth && !past && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onDayTap(date);
                }
              }}
              className={cn(
                'aspect-square rounded-lg text-sm font-medium relative select-none transition overflow-hidden',
                inMonth && !past && 'cursor-pointer',
                !inMonth && 'opacity-30',
                past && 'opacity-20 pointer-events-none',
                inMonth && !period && !officeConfirmed && 'bg-bg border border-border text-text',
                officeConfirmed && 'bg-primary text-white',
                !officeConfirmed && period === 'full' && 'bg-success/85 text-white',
                !officeConfirmed && period === 'half_am' && 'bg-gradient-to-b from-warning/85 to-warning/40 text-white',
                !officeConfirmed && period === 'half_pm' && 'bg-gradient-to-t from-warning/85 to-warning/40 text-white',
                isSelected && 'outline outline-2 outline-offset-1 outline-accent',
              )}
            >
              {/* Submitted hatch overlay — only while the office plan isn't in yet */}
              {submitted && period && !officeConfirmed && (
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.45) 3px, rgba(255,255,255,0.45) 5px)',
                  }}
                />
              )}
              {/* Edge-time opt-outs, visible at a glance */}
              {entry?.exclude_7am && (
                <span className="absolute top-0.5 left-0.5 text-[8px] font-bold leading-none px-0.5 rounded bg-black/25 text-white">
                  no 7
                </span>
              )}
              {entry?.exclude_5pm && (
                <span className="absolute top-0.5 right-0.5 text-[8px] font-bold leading-none px-0.5 rounded bg-black/25 text-white">
                  no 5
                </span>
              )}
              <span className="absolute top-1 left-0 right-0 text-center">{dayNum}</span>
              {(period || sched) && (
                <span className="absolute bottom-1 inset-x-0 text-center text-[10px] font-semibold leading-none text-white/95">
                  {periodAbbr(sched?.period ?? period!)}
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
      {mode === 'own' ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
            <Legend swatch="bg-success/85" label="FD Full day" />
            <Legend swatch="bg-warning/85" label="AM / PM Half day" />
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded ring-2 ring-primary ring-inset bg-primary/15" /> Skywings scheduled
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Tap a day: free → Full day → ½ Morning → ½ Afternoon.
            {season === 'summer' && ' Below, 07:10 / 17:00 appear to toggle on or off.'}
          </p>
          {!hasSchedule && (
            <p className="text-xs text-text-muted">
              Tip: Import the schedule so Skywings-planned shifts appear here.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
          <Legend swatch="bg-danger/30 border border-danger" label={`≤ ${LOW_THRESHOLD} pilots`} />
          <Legend swatch="bg-warning/30 border border-warning" label={`< ${OK_THRESHOLD}`} />
          <Legend swatch="bg-success/15 border border-success/30" label="ok" />
          <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> Tap a day for the list</span>
        </div>
      )}

      {/* Day counter */}
      {mode === 'own' && (
        <p className="text-sm text-text-muted text-center">
          {invert
            ? `${freeSet.size} free day${freeSet.size === 1 ? '' : 's'} marked — the rest counts as available`
            : `${Object.keys(dayMap).length} day${Object.keys(dayMap).length === 1 ? '' : 's'} available this month`}
        </p>
      )}

      {/* Actions — only in own-availability mode */}
      {mode === 'own' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => void persist(false)} disabled={pending || invert} className="btn-ghost flex-1 border border-border">
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onPrepareEmail} disabled={pending} className="btn-primary flex-1">
              <Mail className="w-4 h-4 mr-2" /> Prepare email
            </button>
          </div>
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => { setInvert(v => !v); setFreeSet(new Set()); setMsg(null); }}
              className={cn(
                'btn-ghost flex-1 border text-xs',
                invert ? 'border-primary text-primary-dark bg-primary/10' : 'border-border',
              )}
            >
              <Repeat className="w-3.5 h-3.5 mr-1" />
              {invert ? 'Inverted: tap free days' : 'Mark free days instead'}
            </button>
            {invert && (
              <button onClick={applyInvert} className="btn-ghost flex-1 border border-success/40 text-success text-xs">
                <Check className="w-3.5 h-3.5 mr-1" /> Apply
              </button>
            )}
            <button onClick={onExportIcs} disabled={invert} className="btn-ghost flex-1 border border-border text-xs">
              <CalendarPlus className="w-3.5 h-3.5 mr-1" /> To my calendar
            </button>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              onClick={clearMonth}
              disabled={pending}
              className="flex-1 text-text-muted underline-offset-2 hover:underline py-1"
            >
              <RotateCcw className="w-3 h-3 inline mr-1" /> Clear month
            </button>
            {submitted && (
              <button
                onClick={onResetSubmission}
                disabled={pending}
                className="flex-1 text-text-muted underline-offset-2 hover:underline py-1"
              >
                Mark as not sent
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pilot-list sheet in plan mode */}
      {planDate && fullPlan?.days?.[planDate] && (
        <PilotListSheet
          date={planDate}
          pilots={fullPlan.days[planDate].pilots}
          ownName={pilotName}
          onClose={() => setPlanDate(null)}
        />
      )}

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
  full: 'Full day', half_am: '½ Morning', half_pm: '½ Afternoon',
};

const BUS_SIZE = 7;

function isOwnPilot(rosterName: string, ownName: string): boolean {
  if (!ownName) return false;
  const r = rosterName.toLowerCase().trim();
  const o = ownName.toLowerCase().trim();
  return r === o || o.includes(r) || r.includes(o);
}

function PilotListSheet({
  date, pilots, ownName, onClose,
}: { date: string; pilots: FullPlanPilot[]; ownName: string; onClose: () => void }) {
  const [, m, d] = date.split('-');
  // Older imports stored before the number-field was added: fall back to
  // array position so display still works. Re-import gives proper numbers.
  const normalized = pilots.map((p, i) => ({ ...p, number: p.number ?? i + 1 }));
  normalized.sort((a, b) => a.number - b.number);
  const am = normalized.filter(p => p.period === 'full' || p.period === 'half_am');
  const pm = normalized.filter(p => p.period === 'full' || p.period === 'half_pm');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-t-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold">
            {d}.{m}. · {pilots.length} {pilots.length === 1 ? 'pilot' : 'pilots'}
          </h3>
          <button onClick={onClose} className="p-1 text-text-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <RosterSection title="Morning" pilots={am} ownName={ownName} />
        <RosterSection title="Afternoon" pilots={pm} ownName={ownName} />

        <button type="button" onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  );
}

function RosterSection({
  title, pilots, ownName,
}: { title: string; pilots: FullPlanPilot[]; ownName: string }) {
  if (pilots.length === 0) return null;
  // Pilots are already sorted by Skywings number (priority). Chunk into 7s
  // — that's the bus assignment: first 7 = Bus 1, next 7 = Bus 2, etc.
  const buses: FullPlanPilot[][] = [];
  for (let i = 0; i < pilots.length; i += BUS_SIZE) {
    buses.push(pilots.slice(i, i + BUS_SIZE));
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title} · {pilots.length}
      </p>
      {buses.map((bus, idx) => (
        <BusGroup key={idx} index={idx} total={buses.length} pilots={bus} ownName={ownName} />
      ))}
    </div>
  );
}

function BusGroup({
  index, total, pilots, ownName,
}: { index: number; total: number; pilots: FullPlanPilot[]; ownName: string }) {
  const label = total === 1 ? 'Roster' : `Bus ${index + 1}`;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-baseline justify-between bg-bg-subtle/60 px-2.5 py-1">
        <span className="text-xs font-semibold text-text">{label}</span>
        <span className="text-[10px] text-text-muted">
          {pilots.length} · No. {pilots[0].number}–{pilots[pilots.length - 1].number}
        </span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {pilots.map(p => {
          const own = isOwnPilot(p.name, ownName);
          return (
            <li
              key={`${p.name}-${p.number}`}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5',
                own && 'bg-primary/10',
              )}
            >
              <span className="font-mono tabular-nums text-xs text-text-muted w-5 text-right">
                {p.number}
              </span>
              <span className={cn('flex-1 min-w-0 truncate', own && 'font-semibold text-primary-dark')}>
                {p.name}
              </span>
              {p.period !== 'full' && (
                <span className="text-[10px] text-text-muted">{p.period === 'half_am' ? 'AM' : 'PM'}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
      <span className="text-[11px] mt-0.5">{active ? 'in' : 'out'}</span>
    </button>
  );
}
