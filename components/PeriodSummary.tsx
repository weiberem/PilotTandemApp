import { formatChf } from '@/lib/utils';
import type { DayTotals } from '@/lib/flights';

/**
 * Aggregated tile-summary for a day, month or any other window. Only renders
 * categories that have at least one entry, and shows the CHF generated per
 * category. PP/CC/C are combined into one "Foto·Video" tile with the per-
 * subtype counts kept visible.
 */
export function PeriodSummary({
  totals, totalLabel, totalAmount,
}: {
  totals: DayTotals;
  totalLabel: string;
  /** When omitted, falls back to personalTotalChf (= invoice + CC + Cash). */
  totalAmount?: number;
}) {
  const photoCount = totals.ppCount + totals.ccCount + totals.cCount;
  const photoChf = totals.ppChf + totals.ccChf + totals.cChf;

  type Tile = { key: string; counts: string; subLabel?: string; label: string; chf: number };
  const tiles: Tile[] = [];
  if (totals.flightsBilled > 0) {
    tiles.push({
      key: 'flights',
      counts: String(totals.flightsBilled),
      label: 'Flights',
      chf: totals.flightsChf,
    });
  }
  if (photoCount > 0) {
    const parts: { n: number; lbl: string }[] = [];
    if (totals.ppCount > 0) parts.push({ n: totals.ppCount, lbl: 'PP' });
    if (totals.ccCount > 0) parts.push({ n: totals.ccCount, lbl: 'CC' });
    if (totals.cCount > 0) parts.push({ n: totals.cCount, lbl: 'C' });
    tiles.push({
      key: 'photo',
      counts: parts.map(p => p.n).join(' · '),
      subLabel: parts.map(p => p.lbl).join(' · '),
      label: 'Photo · Video',
      chf: photoChf,
    });
  }
  if (totals.thermalCount > 0) {
    tiles.push({
      key: 'thermal',
      counts: String(totals.thermalCount),
      label: 'Thermal',
      chf: totals.thermalChf,
    });
  }
  if (totals.noShowCount > 0) {
    tiles.push({
      key: 'noshow',
      counts: String(totals.noShowCount),
      label: 'No-Show',
      chf: totals.noShowChf,
    });
  }

  const amount = totalAmount ?? totals.personalTotalChf;

  return (
    <div className="card p-4 space-y-3">
      {tiles.length > 0 && (
        <div className="flex gap-2">
          {tiles.map(t => (
            <div key={t.key} className="flex-1 min-w-0 text-center">
              <div className="text-2xl font-mono font-semibold tabular-nums leading-tight">{t.counts}</div>
              {t.subLabel && (
                <div className="font-mono text-[10px] text-text-muted tracking-wide">{t.subLabel}</div>
              )}
              <div className="text-xs text-text-muted">{t.label}</div>
              <div className="font-mono text-[11px] text-text-muted mt-0.5">{formatChf(t.chf)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-border pt-2 flex items-baseline justify-between">
        <span className="text-sm text-text-muted">{totalLabel}</span>
        <span className="font-mono font-semibold">{formatChf(amount)}</span>
      </div>
    </div>
  );
}
