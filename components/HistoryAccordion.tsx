import Link from 'next/link';
import { Check, Circle, Plus, ChevronDown } from 'lucide-react';
import { formatChf, formatDateDe } from '@/lib/utils';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import { FlightLine } from './FlightLine';

export type DayData = {
  date: string;
  flights: FlightRow[];
  verified: boolean;
};

export type MonthData = {
  monthKey: string;        // "2026-05"
  label: string;           // "Mai 2026"
  days: DayData[];
};

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

export function buildMonths(
  flights: FlightRow[], verifiedDates: Set<string>,
): MonthData[] {
  const byMonth = new Map<string, Map<string, FlightRow[]>>();
  for (const f of flights) {
    const monthKey = f.flight_date.slice(0, 7);
    let month = byMonth.get(monthKey);
    if (!month) { month = new Map(); byMonth.set(monthKey, month); }
    const list = month.get(f.flight_date) ?? [];
    list.push(f);
    month.set(f.flight_date, list);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([monthKey, dayMap]) => ({
      monthKey,
      label: monthLabel(monthKey),
      days: [...dayMap.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, flights]) => ({
          date, flights, verified: verifiedDates.has(date),
        })),
    }));
}

export function DayDetails({ day, rates }: { day: DayData; rates: PilotRates }) {
  const totals = computeDayTotals(day.flights, rates);
  return (
    <details className="border-b border-border last:border-b-0 group">
      <summary className="flex items-center gap-3 p-3 cursor-pointer list-none hover:bg-bg-subtle">
        <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:rotate-180" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <span>{formatDateDe(day.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
            {day.verified
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
      </summary>
      <div className="divide-y divide-border bg-bg-subtle/30">
        {day.flights.map(f => <FlightLine key={f.id} flight={f} />)}
        <Link
          href={`/log?date=${day.date}`}
          className="flex items-center gap-2 p-3 pl-10 text-primary text-sm hover:bg-bg-subtle"
        >
          <Plus className="w-4 h-4" /> Flug an diesem Tag erfassen
        </Link>
      </div>
    </details>
  );
}

export function MonthDetails({ month, rates }: { month: MonthData; rates: PilotRates }) {
  const allFlights = month.days.flatMap(d => d.flights);
  const totals = computeDayTotals(allFlights, rates);
  return (
    <details className="card overflow-hidden group">
      <summary className="flex items-center gap-3 p-3 cursor-pointer list-none hover:bg-bg-subtle">
        <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:rotate-180" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold capitalize">{month.label}</div>
          <div className="text-xs text-text-muted">
            {totals.flightsBilled} Flüge · {month.days.length} Tag{month.days.length === 1 ? '' : 'e'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm">{formatChf(totals.totalChf)}</div>
          <Link
            href={`/flights?month=${month.monthKey}`}
            className="text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Übersicht →
          </Link>
        </div>
      </summary>
      <div className="border-t border-border">
        {month.days.map(d => <DayDetails key={d.date} day={d} rates={rates} />)}
      </div>
    </details>
  );
}
