'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  PHOTO_STATUSES, type PhotoStatus, type FlightInput, type FlightRow,
} from '@/lib/flights';
import {
  getCurrentTripTimes, resolveSeason, type Season,
} from '@/lib/tripTimes';
import { type PilotCompany, companyTimesForSeason } from '@/lib/pilotCompanies';
import { createFlight, updateFlight } from '@/app/(pilot)/log/actions';

const SKYWINGS = 'Skywings';

type Props = {
  mode: 'create' | 'edit';
  flight?: FlightRow;
  defaults: FlightInput;
  seasonOverride: string | null;
  primaryCompany: string;
  /** Scheduled trip times for this date (from Einsatzplan); falls back to all season times. */
  scheduledTimes: string[];
  /** Other companies registered by this pilot (Settings → Other companies). */
  otherCompanies?: PilotCompany[];
};

export function FlightForm({
  mode, flight, defaults, seasonOverride, primaryCompany, scheduledTimes, otherCompanies = [],
}: Props) {
  const router = useRouter();
  const season: Season = resolveSeason(seasonOverride, new Date(defaults.flight_date));

  const [form, setForm] = useState<FlightInput>(defaults);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isSkywings = form.company === SKYWINGS || form.company === primaryCompany && primaryCompany.toLowerCase().startsWith('skyw');
  const isSkywingsLike = form.company === SKYWINGS || form.company.toLowerCase().includes('skyw');

  // If the selected company has its own fixed schedule, use that.
  const matchedOther = useMemo(
    () => otherCompanies.find(c => c.name === form.company),
    [otherCompanies, form.company],
  );

  const tripTimeOptions = useMemo(() => {
    if (matchedOther) {
      const seasonal = companyTimesForSeason(matchedOther, season);
      if (seasonal && seasonal.length > 0) {
        const list = [...seasonal];
        if (form.trip_time && !list.includes(form.trip_time)) list.unshift(form.trip_time);
        return list;
      }
    }
    if (!isSkywingsLike) return [] as readonly string[];
    const seasonTimes = getCurrentTripTimes(season);
    // Show scheduled times first if available; otherwise full season list.
    const list = scheduledTimes.length > 0 ? scheduledTimes : seasonTimes;
    // Ensure the currently-selected trip_time appears in the list.
    if (form.trip_time && !list.includes(form.trip_time)) {
      return [form.trip_time, ...list];
    }
    return list;
  }, [isSkywingsLike, matchedOther, season, scheduledTimes, form.trip_time]);

  const useDropdown = isSkywingsLike || tripTimeOptions.length > 0;

  function patch<K extends keyof FlightInput>(key: K, value: FlightInput[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Enforce no-show invariants on the client.
      if (key === 'is_no_show' && value === true) {
        next.photo_status = 'none';
        next.is_double_airtime = false;
      }
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = mode === 'create'
        ? await createFlight(form)
        : await updateFlight(flight!.id, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/log?added=1');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Date */}
      <Field label="Date">
        <input
          type="date" value={form.flight_date}
          onChange={e => patch('flight_date', e.target.value)}
          className="w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
        />
      </Field>

      {/* Trip time */}
      <Field label="Departure time">
        {useDropdown ? (
          <select
            value={form.trip_time}
            onChange={e => patch('trip_time', e.target.value)}
            className="w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono text-lg"
          >
            {tripTimeOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        ) : (
          <input
            type="time" value={form.trip_time}
            onChange={e => patch('trip_time', e.target.value)}
            className="w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono text-lg"
          />
        )}
      </Field>

      {/* Photo segmented control */}
      <Field label="Photo">
        <div className={cn(
          'grid grid-cols-4 gap-1 rounded-lg bg-bg p-1 border border-border',
          form.is_no_show && 'opacity-40 pointer-events-none',
        )}>
          {PHOTO_STATUSES.map(p => (
            <button
              key={p} type="button"
              onClick={() => patch('photo_status', p)}
              aria-pressed={form.photo_status === p}
              className={cn(
                'min-h-tap rounded-md font-mono text-sm font-semibold transition',
                form.photo_status === p
                  ? 'bg-white text-text shadow-sm border border-border'
                  : 'text-text-muted',
              )}
            >
              {p === 'none' ? '—' : p}
            </button>
          ))}
        </div>
      </Field>

      {/* No-Show + Thermal toggles */}
      <div className="grid grid-cols-2 gap-3">
        <Toggle
          label="No-Show"
          checked={form.is_no_show}
          onChange={v => patch('is_no_show', v)}
          warning
        />
        <Toggle
          label="Thermal ↑"
          checked={form.is_double_airtime}
          onChange={v => patch('is_double_airtime', v)}
          disabled={form.is_no_show}
        />
      </div>

      {/* Tip */}
      <Field label="Tip (CHF)">
        <input
          type="number" inputMode="decimal" step="1" min="0"
          value={form.tip_chf || ''}
          onChange={e => patch('tip_chf', Number(e.target.value || 0))}
          placeholder="0"
          className="w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white font-mono"
        />
      </Field>

      {/* Company switcher */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Company: <span className="font-medium text-text">{form.company}</span></span>
        <button
          type="button"
          onClick={() => setCompanyPickerOpen(true)}
          className="text-primary underline-offset-2 hover:underline"
        >
          Other company
        </button>
      </div>

      {/* Notes (optional, collapsed) */}
      <details className="text-sm">
        <summary className="text-text-muted cursor-pointer min-h-tap inline-flex items-center">Note (optional)</summary>
        <textarea
          value={form.notes ?? ''}
          onChange={e => patch('notes', e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 bg-white"
        />
      </details>

      {error && <p className="text-danger text-sm" role="alert">{error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full text-base">
        {pending ? 'Saving…' : mode === 'create' ? 'Log' : 'Update'}
      </button>

      {companyPickerOpen && (
        <CompanyPicker
          current={form.company}
          primaryCompany={primaryCompany}
          otherCompanies={otherCompanies}
          onPick={(c) => { patch('company', c); setCompanyPickerOpen(false); }}
          onClose={() => setCompanyPickerOpen(false)}
        />
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({
  label, checked, onChange, disabled, warning,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; warning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        'min-h-tap rounded-lg border px-3 py-2 flex items-center justify-between font-medium transition',
        checked
          ? warning
            ? 'border-warning bg-warning/10 text-text'
            : 'border-primary bg-primary/10 text-primary-dark'
          : 'border-border bg-white text-text-muted',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      <span>{label}</span>
      <span className={cn(
        'inline-flex w-10 h-6 rounded-full transition relative',
        checked ? (warning ? 'bg-warning' : 'bg-primary') : 'bg-border',
      )}>
        <span className={cn(
          'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition',
          checked ? 'left-[18px]' : 'left-0.5',
        )} />
      </span>
    </button>
  );
}

function CompanyPicker({
  current, primaryCompany, otherCompanies, onPick, onClose,
}: {
  current: string;
  primaryCompany: string;
  otherCompanies: PilotCompany[];
  onPick: (company: string) => void;
  onClose: () => void;
}) {
  // Primary first, then the pilot's registered other companies.
  const choices = useMemo(() => {
    const list: Array<{ name: string; color: string; subtitle?: string }> = [
      { name: primaryCompany, color: '#E08A0B', subtitle: 'Primary' },
    ];
    for (const c of otherCompanies) {
      if (c.name !== primaryCompany) list.push({ name: c.name, color: c.color_hex });
    }
    return list;
  }, [primaryCompany, otherCompanies]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-t-2xl p-4 space-y-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-1 w-10 bg-border rounded-full mx-auto" />
        <h3 className="font-display font-semibold text-center">Choose company</h3>
        {choices.map(c => (
          <button
            key={c.name}
            type="button"
            onClick={() => onPick(c.name)}
            className={cn(
              'w-full min-h-tap rounded-lg border px-3 py-2 text-left inline-flex items-center gap-2.5',
              current === c.name ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <span className="flex-1">{c.name}</span>
            {c.subtitle && <span className="text-xs text-text-muted">{c.subtitle}</span>}
          </button>
        ))}
        <p className="text-xs text-text-muted pt-1">
          Manage companies in Settings → Other companies.
        </p>
        <button type="button" onClick={onClose} className="btn-ghost w-full mt-2">Cancel</button>
      </div>
    </div>
  );
}
