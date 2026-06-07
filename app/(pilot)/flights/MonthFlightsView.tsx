'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, ChevronDown, AlertCircle, Wind, Plus, RotateCcw, Check, Circle,
} from 'lucide-react';
import { cn, formatChf, formatDateDe } from '@/lib/utils';
import type { DayTotals, FlightRow } from '@/lib/flights';
import { PhotoStatusSwitch } from '@/components/PhotoStatusSwitch';

export type DayGroup = {
  date: string;
  flights: FlightRow[];
  totals: DayTotals;
  verified: boolean;
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(year: number, monthIndex0: number): string {
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthIndex0, 1)));
}

export function MonthFlightsView({
  month, year, monthIndex0, days, monthTotals,
}: {
  month: string;
  year: number;
  monthIndex0: number;
  days: DayGroup[];
  monthTotals: DayTotals;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(date: string) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/flights?month=${shiftMonth(month, -1)}`)}
          className="btn-ghost border border-border min-w-tap" aria-label="Vorheriger Monat"
        ><ChevronLeft className="w-5 h-5" /></button>
        <button
          onClick={() => {
            const now = new Date();
            router.push(`/flights?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
          }}
          className="text-center"
        >
          <div className="font-display font-semibold text-lg capitalize">{monthLabel(year, monthIndex0)}</div>
          <div className="text-xs text-primary inline-flex items-center gap-1 justify-center">
            <RotateCcw className="w-3 h-3" /> Aktueller Monat
          </div>
        </button>
        <button
          onClick={() => router.push(`/flights?month=${shiftMonth(month, 1)}`)}
          className="btn-ghost border border-border min-w-tap" aria-label="Nächster Monat"
        ><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Month summary */}
      <div className="card p-4 grid grid-cols-4 gap-2 text-center">
        <Stat n={monthTotals.flightsBilled} label="Flüge" />
        <Stat n={monthTotals.ppCount} label="PP" />
        <Stat n={monthTotals.thermalCount} label="Thermal" />
        <Stat n={monthTotals.noShowCount} label="No-Show" />
        <div className="col-span-4 border-t border-border pt-2 mt-1 flex items-baseline justify-between">
          <span className="text-sm text-text-muted">Umsatz (ohne Trinkgeld)</span>
          <span className="font-mono font-semibold">{formatChf(monthTotals.totalChf)}</span>
        </div>
      </div>

      {/* Day list */}
      {days.length === 0 ? (
        <div className="card p-6 text-center text-text-muted">
          Keine Flüge in diesem Monat.
        </div>
      ) : (
        <ul className="space-y-2">
          {days.map(({ date, flights, totals, verified }) => {
            const isOpen = open.has(date);
            return (
              <li key={date} className="card overflow-hidden">
                <button
                  onClick={() => toggle(date)}
                  className="w-full flex items-center gap-3 p-3 text-left min-h-[56px]"
                >
                  <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', isOpen && 'rotate-180')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <span>{formatDateDe(date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                      {verified
                        ? <span className="inline-flex items-center text-success" title="Verifiziert"><Check className="w-3.5 h-3.5" /></span>
                        : <span className="inline-flex items-center text-warning" title="Noch nicht verifiziert"><Circle className="w-3.5 h-3.5" /></span>
                      }
                    </div>
                    <div className="text-xs text-text-muted">
                      {totals.flightsBilled} Flüge
                      {totals.ppCount > 0 && ` · ${totals.ppCount} PP`}
                      {totals.thermalCount > 0 && ` · ${totals.thermalCount} Thermal`}
                      {totals.noShowCount > 0 && ` · ${totals.noShowCount} No-Show`}
                    </div>
                  </div>
                  <div className="font-mono text-sm">{formatChf(totals.totalChf)}</div>
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {flights.map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-3 pl-10 flex-wrap">
                        <span className="font-mono text-sm tabular-nums w-12">{f.trip_time}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark">
                          {f.company}
                        </span>
                        <PhotoStatusSwitch flightId={f.id} current={f.photo_status} disabled={f.is_no_show} />
                        {f.is_no_show && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No-Show
                          </span>
                        )}
                        {f.is_double_airtime && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent inline-flex items-center gap-1">
                            <Wind className="w-3 h-3" /> Thermal
                          </span>
                        )}
                        <div className="flex-1" />
                        {Number(f.tip_chf) > 0 && (
                          <span className="font-mono text-xs text-text-muted">{formatChf(Number(f.tip_chf))}</span>
                        )}
                        <Link href={`/log/${f.id}/edit`} className="text-xs text-primary hover:underline">
                          bearbeiten
                        </Link>
                      </div>
                    ))}
                    <Link
                      href={`/log?date=${date}`}
                      className="flex items-center gap-2 p-3 pl-10 text-primary text-sm hover:bg-bg"
                    >
                      <Plus className="w-4 h-4" /> Flug an diesem Tag erfassen
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-mono font-semibold">{n}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

