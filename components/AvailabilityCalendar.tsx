'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Mail, Check, AlertTriangle, Users, X, RotateCcw, CalendarPlus, Repeat, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addMonths, buildMailto, buildMailtoInverted,
  monthGrid, monthLabel, monthFirst, nextDeadlineInfo,
  CHANGE_REASON_LABELS_EN, formatChangeRequestDate, summarizeChangeRequests,
  buildChangeRequestEmail, buildWhatsAppLink, DESK_WHATSAPP,
  type AvailabilityDay, type DayPeriod, type ChangeRequest,
  type ChangeRequestMap, type ChangeRequestReason,
} from '@/lib/availability';
import { resolveSeason } from '@/lib/tripTimes';
import { isoDateZurich, nowInZurich } from '@/lib/utils';
import { saveAvailability, resetSubmission, resolveChangeRequest } from '@/app/(pilot)/availability/actions';
import { AvailabilityStatusBanner } from '@/components/AvailabilityStatusBanner';
import { Toast } from '@/components/Toast';
import type { FullPlan, FullPlanPilot } from '@/lib/einsatzplanParser';

export type FullPlansByMonth = Record<string, FullPlan>;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type ScheduleMap = Record<string, { period: DayPeriod; times: string[] }>;

type IncomingSwap = { date: string; fromPilotId: string; fromPilotName: string; note?: string };

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
  changeRequestsByMonth: Record<string, ChangeRequestMap>;
  googleConnected: boolean;
};

// Pilot-count thresholds for the "Einsatzplan"-mode tile colour.
// Below LOW = red, below OK = amber, else neutral. Adjust later if needed.
const LOW_THRESHOLD = 8;
const OK_THRESHOLD = 11;

export function AvailabilityCalendar({
  pilotName, officeEmail, seasonOverride, initialMonth, initialDaysByMonth,
  submittedByMonth, schedule, fullPlansByMonth, changeRequestsByMonth, googleConnected,
}: Props) {
  const [mode, setMode] = useState<Mode>('own');
  // Day-detail sheet (roster + change request). Opens in plan mode on any
  // planned day, and in own mode on an office-confirmed day.
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  // Change requests, keyed by month → date. Mirrored in state so submit/resolve
  // update the calendar (and badges) without a full page reload.
  const [crByMonth, setCrByMonth] = useState<Record<string, ChangeRequestMap>>(changeRequestsByMonth);
  // Swap requests addressed to this pilot for the viewed month (Schedule tab).
  const [incomingSwaps, setIncomingSwaps] = useState<IncomingSwap[]>([]);
  // "Add to calendar" menu (collapsed by default to keep the actions tidy).
  const [calMenuOpen, setCalMenuOpen] = useState(false);
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
  const crMap = crByMonth[monthKey] ?? {};
  const crStats = summarizeChangeRequests(crMap);

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
      // Cycle through every state so half-days and edge times work here too:
      //   available (default) → free → ½AM → ½PM → full (with edge strip) → …
      // First tap still marks "free" for fast bulk entry; keep tapping to refine.
      const isFree = freeSet.has(date);
      const p = dayMap[date]?.period;
      const setFree = (add: boolean) => setFreeSet(prev => {
        const next = new Set(prev);
        if (add) next.add(date); else next.delete(date);
        return next;
      });
      if (!isFree && !p) {                 // available → free
        setFree(true); setSelectedDate(null);
      } else if (isFree) {                 // free → ½AM
        setFree(false); setDayState(date, 'half_am'); setSelectedDate(date);
      } else if (p === 'half_am') {        // ½AM → ½PM
        setDayState(date, 'half_pm'); setSelectedDate(date);
      } else if (p === 'half_pm') {        // ½PM → full (editable: edge strip)
        setDayState(date, 'full'); setSelectedDate(date);
      } else {                             // full → back to default available
        setDayState(date, null); setSelectedDate(null);
      }
      return;
    }
    // Office-confirmed day → open the day sheet to request a change rather than
    // cycling the (now moot) availability period.
    if (schedule[date]) { setSheetDate(date); return; }
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

  /** Record a change request and notify the desk by WhatsApp (default) or email. */
  async function submitChangeRequest(
    date: string, reason: ChangeRequestReason, note: string,
    swapWith?: string, channel: 'email' | 'whatsapp' = 'whatsapp',
  ): Promise<boolean> {
    const crMonthKey = `${date.slice(0, 7)}-01`;
    const swap = reason === 'swap' ? swapWith?.trim() || undefined : undefined;
    try {
      const res = await fetch('/api/availability/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason, note: note.trim() || undefined, swap_with: swap, notify: channel }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: j.error ?? 'Could not send change request.' });
        return false;
      }
      const cr: ChangeRequest = {
        reason, note: note.trim() || undefined,
        status: 'pending', created_at: new Date().toISOString(), resolved_at: null,
        swap_with: swap,
      };
      setCrByMonth(prev => ({ ...prev, [crMonthKey]: { ...(prev[crMonthKey] ?? {}), [date]: cr } }));

      if (channel === 'whatsapp') {
        const { text } = buildChangeRequestEmail({ pilotName, date, reason, note });
        const message = swap ? `${text}\nTausch mit: ${swap}` : text;
        window.open(buildWhatsAppLink(DESK_WHATSAPP, message), '_blank');
        setMsg({ kind: 'ok', text: 'Opening WhatsApp to the desk…' });
      } else {
        setMsg({ kind: 'ok', text: j.demo ? 'Recorded (demo — no email sent).' : 'Change request emailed to the office.' });
      }
      return true;
    } catch {
      setMsg({ kind: 'err', text: 'Network error — change request not sent.' });
      return false;
    }
  }

  /** Accept an incoming swap addressed to this pilot. */
  async function acceptSwap(s: IncomingSwap) {
    try {
      const res = await fetch('/api/availability/swaps/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: s.date, fromPilotId: s.fromPilotId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ kind: 'err', text: j.error ?? 'Could not accept swap.' }); return; }
      setIncomingSwaps(prev => prev.filter(x => !(x.date === s.date && x.fromPilotId === s.fromPilotId)));
      setMsg({ kind: 'ok', text: `Swap with ${s.fromPilotName} confirmed — the office has been emailed.` });
    } catch {
      setMsg({ kind: 'err', text: 'Network error — swap not accepted.' });
    }
  }

  function onResolveChangeRequest(date: string) {
    const crMonthKey = `${date.slice(0, 7)}-01`;
    startTransition(async () => {
      const r = await resolveChangeRequest(date);
      if (!r.ok) { setMsg({ kind: 'err', text: r.error }); return; }
      setCrByMonth(prev => {
        const month = { ...(prev[crMonthKey] ?? {}) };
        const cr = month[date];
        if (cr) month[date] = { ...cr, status: 'resolved', resolved_at: new Date().toISOString() };
        return { ...prev, [crMonthKey]: month };
      });
      setMsg({ kind: 'ok', text: 'Marked resolved.' });
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
    // Persist current selection first — the server reads from the saved
    // submission, so unsaved local edits would be missed otherwise.
    startTransition(async () => {
      const save = await saveAvailability({ month: monthKey, days });
      if (!save.ok) { setMsg({ kind: 'err', text: save.error }); return; }
      // Open the ICS endpoint. On iOS Safari this triggers the Calendar
      // "Add Events" sheet; on desktop browsers it downloads the file.
      window.location.href = `/api/availability/ics?month=${monthKey}`;
      setMsg({ kind: 'ok', text: 'Calendar import opening — pick "Add to Calendar" on iPhone or import the file on desktop.' });
    });
  }

  /** One-click push of this month's availability into the pilot's Google Calendar. */
  function onPushGoogle() {
    if (!googleConnected) {
      setMsg({ kind: 'err', text: 'Connect Google in Settings → Google Drive first, then try again.' });
      return;
    }
    const days = Object.values(dayMap);
    if (days.length === 0) { setMsg({ kind: 'err', text: 'No availability entered.' }); return; }
    startTransition(async () => {
      // Persist first — the server reads the saved submission.
      const save = await saveAvailability({ month: monthKey, days });
      if (!save.ok) { setMsg({ kind: 'err', text: save.error }); return; }
      const res = await fetch('/api/availability/gcal-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: j.error === 'not_connected'
          ? 'Connect Google in Settings → Google Drive first.'
          : (j.detail ?? j.error ?? 'Could not add to Google Calendar.') });
        return;
      }
      setMsg({ kind: 'ok', text: `Added to Google Calendar (${j.total} day${j.total === 1 ? '' : 's'}).` });
    });
  }

  /** Remove the TandemLog availability events this month from Google Calendar. */
  function onClearGoogle() {
    if (!googleConnected) {
      setMsg({ kind: 'err', text: 'Connect Google in Settings → Google Drive first.' });
      return;
    }
    startTransition(async () => {
      const res = await fetch('/api/availability/gcal-push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ kind: 'err', text: j.detail ?? j.error ?? 'Could not clear Google Calendar.' }); return; }
      setMsg({ kind: 'ok', text: `Removed ${j.deleted} TandemLog event${j.deleted === 1 ? '' : 's'} from Google Calendar.` });
    });
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
      const dayList = Object.values(updates);
      startTransition(async () => {
        await saveAvailability({ month: monthKey, days: dayList, mark_submitted: true });
      });
      // The concise "available except…" form only carries full free days. If
      // any remaining day is a half-day or has an edge-time opt-out, fall back
      // to the explicit per-day listing so the office sees those constraints.
      const hasCustom = dayList.some(d => d.period !== 'full' || d.exclude_7am || d.exclude_5pm);
      window.location.href = hasCustom
        ? buildMailto({
            to: officeEmail, pilotName,
            year: cursor.year, monthIndex0: cursor.monthIndex0,
            days: dayList,
          })
        : buildMailtoInverted({
            to: officeEmail, pilotName,
            year: cursor.year, monthIndex0: cursor.monthIndex0,
            freeDates: [...freeSet],
          });
      setInvert(false);
      setSelectedDate(null);
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

  // Fetch incoming swap requests for the viewed month while on the Schedule tab.
  useEffect(() => {
    if (mode !== 'plan') { setIncomingSwaps([]); return; }
    let cancelled = false;
    fetch(`/api/availability/swaps/incoming?month=${monthKey}`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(j => { if (!cancelled) setIncomingSwaps((j.requests as IncomingSwap[]) ?? []); })
      .catch(() => { if (!cancelled) setIncomingSwaps([]); });
    return () => { cancelled = true; };
  }, [mode, monthKey]);

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

      {mode === 'own' && (
        <AvailabilityStatusBanner
          submitted={submitted}
          viewedMonthLabel={monthLabel(cursor.year, cursor.monthIndex0)}
          deadline={deadline}
        />
      )}

      {/* Approach toggle: start from an empty month and add the days you can
          work, or start fully available and mark the days off. Both then allow
          per-day ½-day + 07:10/17:00 refinement. */}
      {mode === 'own' && (
        <div>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-bg-subtle text-sm">
            <button
              onClick={() => { if (invert) { setInvert(false); setFreeSet(new Set()); setSelectedDate(null); setMsg(null); } }}
              className={cn(
                'min-h-[40px] rounded-md font-medium transition',
                !invert ? 'bg-white text-text shadow-sm' : 'text-text-muted',
              )}
            >Add my days</button>
            <button
              onClick={() => { if (!invert) { setInvert(true); setFreeSet(new Set()); setSelectedDate(null); setMsg(null); } }}
              className={cn(
                'min-h-[40px] rounded-md font-medium transition',
                invert ? 'bg-white text-text shadow-sm' : 'text-text-muted',
              )}
            >Mark days off</button>
          </div>
          <p className="text-xs text-text-muted mt-1 text-center">
            {invert
              ? 'Available all month — tap the days off; tap again to set ½-day / 07:10 / 17:00.'
              : 'Empty month — tap the days you can work (Full → ½AM → ½PM), then set edge times.'}
          </p>
        </div>
      )}

      {mode === 'plan' && incomingSwaps.length > 0 && (
        <div className="card p-3 border-l-4 border-l-accent text-sm space-y-2">
          <div className="font-medium flex items-center gap-2">
            <Repeat className="w-4 h-4" /> Incoming swap requests
          </div>
          {incomingSwaps.map(s => (
            <div key={`${s.fromPilotId}-${s.date}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="font-medium">{s.fromPilotName}</span> · {formatChangeRequestDate(s.date)}
                {s.note ? ` — "${s.note}"` : ''}
              </span>
              <button onClick={() => acceptSwap(s)} className="btn-primary text-xs px-2 py-1 shrink-0">
                Accept
              </button>
            </div>
          ))}
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
          const pendingChange = crMap[date]?.status === 'pending';
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
                onClick={() => inMonth && !past && planDay && setSheetDate(date)}
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
                {pendingChange && <ChangeBadge />}
                {planDay && (
                  <span className="absolute bottom-1 inset-x-0 text-center text-base font-mono font-semibold leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          }

          // Invert-entry mode: first tap marks a day "free" (not available);
          // further taps cycle ½AM → ½PM → full so half-days/edge times work.
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
                  isFree && 'bg-danger/80 text-white',
                  !isFree && !period && 'bg-success/15 border border-success/30 text-text',
                  !isFree && period === 'full' && 'bg-success/85 text-white',
                  !isFree && period === 'half_am' && 'bg-gradient-to-b from-warning/85 to-warning/40 text-white',
                  !isFree && period === 'half_pm' && 'bg-gradient-to-t from-warning/85 to-warning/40 text-white',
                  isSelected && 'outline outline-2 outline-offset-1 outline-accent',
                )}
              >
                {!isFree && entry?.exclude_7am && (period === 'full' || period === 'half_am') && (
                  <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-danger rounded-r-sm pointer-events-none" aria-hidden />
                )}
                {!isFree && entry?.exclude_5pm && (period === 'full' || period === 'half_pm') && (
                  <span className="absolute right-0 top-1/4 bottom-1/4 w-1 bg-danger rounded-l-sm pointer-events-none" aria-hidden />
                )}
                <span className="absolute top-1 left-0 right-0 text-center">{dayNum}</span>
                <span className="absolute bottom-1 inset-x-0 text-center text-[10px] font-semibold leading-none">
                  {isFree ? 'free' : period ? periodAbbr(period) : ''}
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
              {/* Edge-time opt-outs: bold vertical red bars on the day's
                  edges. Half-day rules suppress the bars that wouldn't apply
                  (a half_pm shift never includes 07:10; a half_am shift
                  never includes 17:00). */}
              {entry?.exclude_7am && (period === undefined || period === 'full' || period === 'half_am') && (
                <span
                  className="absolute left-0 top-1 bottom-1 w-3.5 bg-danger flex items-center justify-center rounded-r-md shadow-sm pointer-events-none"
                  aria-label="no 07:10 flight"
                >
                  <span className="text-[8px] font-extrabold leading-none rotate-180 [writing-mode:vertical-rl] text-white tracking-tight whitespace-nowrap">
                    no 07:10
                  </span>
                </span>
              )}
              {entry?.exclude_5pm && (period === undefined || period === 'full' || period === 'half_pm') && (
                <span
                  className="absolute right-0 top-1 bottom-1 w-3.5 bg-danger flex items-center justify-center rounded-l-md shadow-sm pointer-events-none"
                  aria-label="no 17:00 flight"
                >
                  <span className="text-[8px] font-extrabold leading-none [writing-mode:vertical-rl] text-white tracking-tight whitespace-nowrap">
                    no 17:00
                  </span>
                </span>
              )}
              <span className="absolute top-1 left-0 right-0 text-center">{dayNum}</span>
              {pendingChange && <ChangeBadge />}
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
            {invert
              ? 'Tap a day: available → free → ½ Morning → ½ Afternoon → Full day. Keep tapping to refine; the 07:10 / 17:00 strip appears for the selected day.'
              : 'Tap a day: free → Full day → ½ Morning → ½ Afternoon.'}
            {!invert && season === 'summer' && ' Below, 07:10 / 17:00 appear to toggle on or off.'}
            {!invert && ' Tap a confirmed (orange) day to request a change.'}
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
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-warning ring-2 ring-white" /> Change pending
          </span>
          <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> Tap a day: roster + request change</span>
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

      {/* Change-request self-awareness stat for the viewed month */}
      {mode === 'own' && crStats.total > 0 && (
        <p className="text-xs text-text-muted text-center">
          {crStats.total} change request{crStats.total === 1 ? '' : 's'} for{' '}
          <span className="capitalize">{monthLabel(cursor.year, cursor.monthIndex0)}</span>
          {crStats.pending > 0 ? ` · ${crStats.pending} pending` : ''}
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
          {invert && (
            <button onClick={applyInvert} className="btn-ghost w-full border border-success/40 text-success text-xs">
              <Check className="w-3.5 h-3.5 mr-1" /> Apply to calendar
            </button>
          )}

          {/* Collapsible "Add to calendar" menu — keeps the export/sync
              actions out of the way until needed. */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setCalMenuOpen(v => !v)}
              disabled={invert}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium disabled:opacity-50"
              aria-expanded={calMenuOpen}
            >
              <span className="inline-flex items-center gap-2 text-text-muted">
                <CalendarPlus className="w-4 h-4" /> Add to calendar
              </span>
              <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', calMenuOpen && 'rotate-180')} />
            </button>
            {calMenuOpen && !invert && (
              <div className="border-t border-border divide-y divide-border text-sm">
                <button onClick={onExportIcs} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-subtle/60">
                  <CalendarPlus className="w-4 h-4 text-text-muted" />
                  <span><span className="font-medium">.ics file</span> <span className="text-text-muted">— Apple, Outlook, Android</span></span>
                </button>
                <button onClick={onPushGoogle} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-subtle/60">
                  <GoogleIcon className="w-4 h-4" />
                  <span><span className="font-medium">Google Calendar</span> <span className="text-text-muted">— one tap</span></span>
                </button>
                {googleConnected && (
                  <button onClick={onClearGoogle} disabled={pending} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-text-muted hover:bg-bg-subtle/60">
                    <Trash2 className="w-4 h-4" />
                    <span>Remove this month from Google Calendar</span>
                  </button>
                )}
              </div>
            )}
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

      {/* Day-detail + change-request sheet (both modes) */}
      {sheetDate && (() => {
        const roster = fullPlansByMonth[sheetDate.slice(0, 7)]?.days?.[sheetDate]?.pilots ?? null;
        const colleagues = (roster ?? [])
          .map(p => p.name)
          .filter(n => !isOwnPilot(n, pilotName));
        const ownScheduled =
          !!schedule[sheetDate] || !!roster?.find(p => isOwnPilot(p.name, pilotName));
        return (
          <DayDetailSheet
            date={sheetDate}
            pilots={roster}
            ownName={pilotName}
            ownScheduled={ownScheduled}
            colleagues={colleagues}
            changeRequest={crMap[sheetDate] ?? null}
            onSubmitChange={(reason, note, swapWith, channel) => submitChangeRequest(sheetDate, reason, note, swapWith, channel)}
            onResolve={() => onResolveChangeRequest(sheetDate)}
            onClose={() => setSheetDate(null)}
          />
        );
      })()}

      <Toast msg={msg} onClose={() => setMsg(null)} />
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
  // 07:10 is a morning trip — hide the toggle when the pilot only flies PM.
  // 17:00 is an afternoon trip — hide when the pilot only flies AM.
  const show7 = entry.period !== 'half_pm';
  const show17 = entry.period !== 'half_am';
  return (
    <div className="flex items-stretch gap-2">
      {show7
        ? <EdgeButton time="07:10" active={fly7} onClick={onToggle7} />
        : <div className="w-20 shrink-0" aria-hidden />}
      <div className="flex-1 rounded-xl bg-accent text-white flex flex-col items-center justify-center py-2">
        <span className="font-mono text-base leading-none">{d}.{m}.</span>
        <span className="text-xs mt-1 opacity-90">{PERIOD_FULL[entry.period]}</span>
      </div>
      {show17
        ? <EdgeButton time="17:00" active={fly17} onClick={onToggle17} />
        : <div className="w-20 shrink-0" aria-hidden />}
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

function DayDetailSheet({
  date, pilots, ownName, ownScheduled, colleagues, changeRequest, onSubmitChange, onResolve, onClose,
}: {
  date: string;
  pilots: FullPlanPilot[] | null;
  ownName: string;
  ownScheduled: boolean;
  colleagues: string[];
  changeRequest: ChangeRequest | null;
  onSubmitChange: (reason: ChangeRequestReason, note: string, swapWith?: string, channel?: 'email' | 'whatsapp') => Promise<boolean>;
  onResolve: () => void;
  onClose: () => void;
}) {
  const [, m, d] = date.split('-');
  // Older imports stored before the number-field was added: fall back to
  // array position so display still works. Re-import gives proper numbers.
  const normalized = (pilots ?? []).map((p, i) => ({ ...p, number: p.number ?? i + 1 }));
  normalized.sort((a, b) => a.number - b.number);
  const am = normalized.filter(p => p.period === 'full' || p.period === 'half_am');
  const pm = normalized.filter(p => p.period === 'full' || p.period === 'half_pm');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-t-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold">
            {d}.{m}.
            {pilots ? ` · ${pilots.length} ${pilots.length === 1 ? 'pilot' : 'pilots'}` : ' · confirmed'}
          </h3>
          <button onClick={onClose} className="p-1 text-text-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {ownScheduled && (
          <ChangeRequestPanel
            date={date}
            colleagues={colleagues}
            changeRequest={changeRequest}
            onSubmitChange={onSubmitChange}
            onResolve={onResolve}
          />
        )}

        <RosterSection title="Morning" pilots={am} ownName={ownName} />
        <RosterSection title="Afternoon" pilots={pm} ownName={ownName} />

        <button type="button" onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  );
}

const CHANGE_REASON_ORDER: ChangeRequestReason[] =
  ['sick', 'conflict', 'different_time', 'swap', 'other'];

/**
 * Change-request control inside the day sheet. Shown only when the pilot is on
 * that day's roster. Pending → status + "Mark resolved"; otherwise → a
 * collapsible reason/note form that emails the office.
 */
function ChangeRequestPanel({
  date, colleagues, changeRequest, onSubmitChange, onResolve,
}: {
  date: string;
  colleagues: string[];
  changeRequest: ChangeRequest | null;
  onSubmitChange: (reason: ChangeRequestReason, note: string, swapWith?: string, channel?: 'email' | 'whatsapp') => Promise<boolean>;
  onResolve: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ChangeRequestReason>('sick');
  const [note, setNote] = useState('');
  const [swapWith, setSwapWith] = useState('');
  const [sending, setSending] = useState(false);

  if (changeRequest?.status === 'matched') {
    return (
      <div className="rounded-lg border border-success/40 bg-success/10 p-3 space-y-1 text-sm">
        <div className="flex items-center gap-2 font-medium text-success">
          <Check className="w-4 h-4 text-success" /> Swap matched
        </div>
        <p className="text-text-muted">
          {changeRequest.matched_with ? `${changeRequest.matched_with} took this day. ` : ''}
          The office has been emailed.
        </p>
      </div>
    );
  }

  if (changeRequest?.status === 'pending') {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2 font-medium text-warning">
          <AlertTriangle className="w-4 h-4 text-warning" />
          Change requested — pending
        </div>
        <p className="text-text-muted">
          {CHANGE_REASON_LABELS_EN[changeRequest.reason]}
          {changeRequest.swap_with ? ` with ${changeRequest.swap_with}` : ''}
          {changeRequest.note ? ` — "${changeRequest.note}"` : ''}
        </p>
        <p className="text-xs text-text-muted">
          Sent to the office for {formatChangeRequestDate(date)}. They reply by mail or WhatsApp as usual.
        </p>
        <button type="button" onClick={onResolve} className="btn-ghost w-full border border-border text-sm">
          <Check className="w-4 h-4 mr-1" /> Mark resolved
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-1">
        {changeRequest?.status === 'resolved' && (
          <p className="text-xs text-text-muted">Previous change request resolved.</p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost w-full border border-border text-sm"
        >
          <Send className="w-4 h-4 mr-1" /> Request change
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-3 text-sm">
      <p className="font-medium">Need to change {formatChangeRequestDate(date)}?</p>
      <div className="space-y-1.5">
        {CHANGE_REASON_ORDER.map(r => (
          <label key={r} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cr-reason"
              checked={reason === r}
              onChange={() => setReason(r)}
              className="accent-primary"
            />
            <span>{CHANGE_REASON_LABELS_EN[r]}</span>
          </label>
        ))}
      </div>
      {reason === 'swap' && colleagues.length > 0 && (
        <select
          value={swapWith}
          onChange={e => setSwapWith(e.target.value)}
          className="w-full rounded-md border border-border p-2 text-sm bg-white"
        >
          <option value="">Swap with… (pick a colleague)</option>
          {colleagues.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (optional) — e.g. happy to swap with Flo"
        rows={2}
        maxLength={1000}
        className="w-full rounded-md border border-border p-2 text-sm resize-none"
      />
      <div className="space-y-2">
        <button
          type="button"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            const ok = await onSubmitChange(reason, note, swapWith, 'whatsapp');
            setSending(false);
            if (ok) { setOpen(false); setNote(''); setSwapWith(''); }
          }}
          className="btn-primary w-full"
        >
          <WhatsAppIcon className="w-4 h-4 mr-1.5" /> {sending ? 'Opening…' : 'Send via WhatsApp to desk'}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setOpen(false); setNote(''); setSwapWith(''); }}
            disabled={sending}
            className="btn-ghost flex-1 border border-border text-xs"
          >Cancel</button>
          <button
            type="button"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              const ok = await onSubmitChange(reason, note, swapWith, 'email');
              setSending(false);
              if (ok) { setOpen(false); setNote(''); setSwapWith(''); }
            }}
            className="btn-ghost flex-1 border border-border text-xs"
          >
            <Mail className="w-3.5 h-3.5 mr-1" /> Email instead
          </button>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Opens WhatsApp to the desk (+41 79 266 82 28) with a ready-made message.
        {reason === 'swap' && colleagues.length > 0
          ? ' Picking a colleague also lets them confirm the swap in-app.'
          : ''}
      </p>
    </div>
  );
}

/** WhatsApp glyph (uses currentColor so it inherits the button text colour). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.788-.985zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}

/** Google's 4-colour "G" mark, sized via className (width/height). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

/** Small amber alert dot for days with a pending change request. */
function ChangeBadge() {
  return (
    <span
      className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-warning ring-2 ring-white pointer-events-none"
      aria-label="Change requested"
      title="Change requested"
    />
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
