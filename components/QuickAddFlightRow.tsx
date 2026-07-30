'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/Spinner';
import { createFlight } from '@/app/(pilot)/log/actions';
import { PHOTO_STATUSES, type FlightInput, type PhotoStatus } from '@/lib/flights';
import { type PilotCompany, resolveCompanyTimes, suggestColor } from '@/lib/pilotCompanies';
import { SitePicker } from '@/components/SitePicker';
import { NationalityPicker } from '@/components/NationalityPicker';

type Props = {
  defaults: FlightInput;
  scheduledTimes: readonly string[];
  loggedCount: number;
  usedTripTimes: readonly string[];
  primaryCompany: string;
  otherCompanies: PilotCompany[];
  season: 'summer' | 'winter';
  trackSites?: boolean;
  trackNationality?: boolean;
  nationalityCounts?: Record<string, number>;
};

export function QuickAddFlightRow({
  defaults, scheduledTimes, loggedCount, usedTripTimes,
  primaryCompany, otherCompanies, season,
  trackSites = false, trackNationality = false, nationalityCounts = {},
}: Props) {
  const usedSet = new Set(usedTripTimes);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tripTime, setTripTime] = useState(defaults.trip_time);
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>(defaults.photo_status);
  const [company, setCompany] = useState(defaults.company);
  const [takeoff, setTakeoff] = useState<string | null>(defaults.takeoff_site ?? null);
  const [landing, setLanding] = useState<string | null>(defaults.landing_site ?? null);
  const [nationality, setNationality] = useState<string | null>(defaults.passenger_nationality ?? null);
  const [error, setError] = useState<string | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  // A non-primary company the pilot tapped, awaiting "log all following?" confirm.
  const [pendingCompany, setPendingCompany] = useState<string | null>(null);

  // Trip times of the currently active company. Primary → schedule/season list;
  // others → their own schedule (winter falls back to summer).
  const timesFor = useMemo(() => (name: string): string[] => {
    if (name === primaryCompany) return [...scheduledTimes];
    const c = otherCompanies.find(o => o.name === name);
    const t = resolveCompanyTimes(c, name, season);
    return t && t.length > 0 ? t : [...scheduledTimes];
  }, [primaryCompany, otherCompanies, season, scheduledTimes]);

  const activeTimes = timesFor(company);

  function firstFree(times: string[]): string {
    return times.find(t => !usedSet.has(t)) ?? times[times.length - 1] ?? tripTime;
  }

  function chooseCompany(name: string) {
    if (name === company) { setCompanyMenuOpen(false); return; }
    // Switching companies → ask before it applies to the following flights.
    setPendingCompany(name);
    setCompanyMenuOpen(false);
  }

  function confirmCompany() {
    if (!pendingCompany) return;
    setCompany(pendingCompany);
    setTripTime(firstFree(timesFor(pendingCompany)));
    setPendingCompany(null);
  }

  function doAdd() {
    setError(null);
    startTransition(async () => {
      const r = await createFlight({
        ...defaults,
        company,
        trip_time: tripTime,
        photo_status: photoStatus,
        takeoff_site: takeoff,
        landing_site: landing,
        passenger_nationality: nationality,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPhotoStatus('none');
      setNationality(null); // per-passenger; sites persist for the day
      router.refresh();
    });
  }

  const companyList = [primaryCompany, ...otherCompanies.map(c => c.name).filter(n => n !== primaryCompany)];
  const dot = (name: string) => otherCompanies.find(o => o.name === name)?.color_hex ?? suggestColor(name);

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={doAdd}
          disabled={pending || !!pendingCompany}
          aria-label="Log flight"
          className={cn(
            'shrink-0 inline-flex items-center justify-center rounded-full bg-primary text-white',
            'w-12 h-12 shadow-sm hover:bg-primary-dark active:scale-90 transition',
            (pending || !!pendingCompany) && 'opacity-80',
          )}
        >
          {pending ? <Spinner className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTimePickerOpen(o => !o)}
              className="font-mono text-lg tabular-nums px-2 py-0.5 rounded-md hover:bg-bg-subtle"
              aria-expanded={timePickerOpen}
            >
              {tripTime}
            </button>
            <button
              type="button"
              onClick={() => setCompanyMenuOpen(o => !o)}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark hover:bg-primary/20"
              aria-expanded={companyMenuOpen}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot(company) }} />
              {company}
              {companyList.length > 1 && <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {loggedCount === 0 ? 'First flight — time, company & photo adjustable' : `Next flight after ${loggedCount} already logged`}
          </div>
        </div>

        <Link
          href="/log"
          className="shrink-0 inline-flex items-center text-xs text-text-muted hover:text-primary"
          aria-label="Advanced options"
        >
          Options <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {companyMenuOpen && companyList.length > 1 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
          {companyList.map(name => {
            const active = name === company;
            return (
              <button
                key={name}
                type="button"
                onClick={() => chooseCompany(name)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border',
                  active ? 'bg-primary text-white border-primary' : 'bg-bg-card border-border hover:bg-bg-subtle',
                )}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? '#fff' : dot(name) }} />
                {name}
              </button>
            );
          })}
        </div>
      )}

      {pendingCompany && (
        <div className="pt-1 border-t border-border">
          <p className="text-sm">
            Alle folgenden Flüge für <span className="font-medium">{pendingCompany}</span> loggen?
            <span className="block text-xs text-text-muted">
              Bereits geloggte Flüge bleiben unverändert. Trip-Zeiten wechseln auf {pendingCompany}.
            </span>
          </p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setPendingCompany(null)} className="btn-ghost border border-border text-sm">
              Abbrechen
            </button>
            <button type="button" onClick={confirmCompany} className="btn-primary text-sm">
              Ja, wechseln
            </button>
          </div>
        </div>
      )}

      {timePickerOpen && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
          {activeTimes.map(t => {
            const used = usedSet.has(t);
            const active = t === tripTime;
            return (
              <button
                key={t}
                type="button"
                disabled={used && !active}
                onClick={() => { setTripTime(t); setTimePickerOpen(false); }}
                title={used && !active ? 'Already logged' : undefined}
                className={cn(
                  'font-mono text-xs px-2 py-1 rounded-md border',
                  active
                    ? 'bg-primary text-white border-primary'
                    : used
                      ? 'bg-bg-subtle border-border text-text-muted line-through cursor-not-allowed opacity-60'
                      : 'bg-bg-card border-border hover:bg-bg-subtle',
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-text-muted">Photo</span>
        <div role="radiogroup" aria-label="Photo status" className="inline-flex rounded-full border border-border overflow-hidden text-xs">
          {PHOTO_STATUSES.map(s => {
            const active = s === photoStatus;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPhotoStatus(s)}
                className={cn(
                  'px-2.5 py-1 min-w-[32px] transition-colors',
                  active ? 'bg-primary text-white font-semibold' : 'bg-bg-card text-text-muted hover:bg-bg-subtle',
                )}
              >
                {s === 'none' ? '—' : s}
              </button>
            );
          })}
        </div>
      </div>

      {trackSites && (
        <div className="pt-1 border-t border-border">
          <SitePicker
            takeoff={takeoff}
            landing={landing}
            onChange={({ takeoff: t, landing: l }) => { setTakeoff(t); setLanding(l); }}
          />
        </div>
      )}

      {trackNationality && (
        <div className="pt-1 border-t border-border">
          <NationalityPicker value={nationality} counts={nationalityCounts} onChange={setNationality} />
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
