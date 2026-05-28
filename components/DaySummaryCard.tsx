import { formatDateDe, formatChf } from '@/lib/utils';
import type { DayTotals, PilotRates } from '@/lib/flights';
import { forwardRef } from 'react';

type Props = {
  pilotName: string;
  date: string;
  totals: DayTotals;
  rates: PilotRates;
};

export const DaySummaryCard = forwardRef<HTMLDivElement, Props>(function DaySummaryCard(
  { pilotName, date, totals, rates }, ref,
) {
  return (
    <div ref={ref} className="bg-white p-6 rounded-2xl border border-border max-w-sm mx-auto">
      <div className="text-center mb-4 pb-4 border-b border-border">
        <div className="text-primary font-display font-bold text-lg">TandemLog</div>
        <div className="font-semibold mt-1">{pilotName}</div>
        <div className="text-sm text-text-muted">{formatDateDe(new Date(date))}</div>
      </div>

      <div className="space-y-1 font-mono text-sm">
        <Row label="Flüge" count={totals.flightsBilled} rate={rates.flight_rate_chf} amount={totals.flightsChf} />
        <Row label="Foto PP" count={totals.ppCount} rate={rates.photo_prepaid_rate_chf} amount={totals.ppChf} />
        <Row label="Foto CC" count={totals.ccCount} amount={0} dash />
        <Row label="Foto Cash" count={totals.cCount} amount={0} dash />
        <Row label="Thermal" count={totals.thermalCount} rate={rates.thermal_rate_chf} amount={totals.thermalChf} />
        <Row label="No Show" count={totals.noShowCount} rate={rates.no_show_rate_chf} amount={totals.noShowChf} />
        {totals.tipChf > 0 && (
          <Row label="Trinkgeld" count={null} amount={totals.tipChf} />
        )}
      </div>

      <div className="mt-4 pt-4 border-t-2 border-text">
        <div className="flex items-baseline justify-between">
          <span className="font-display font-bold">TOTAL</span>
          <span className="font-mono font-bold text-2xl">{formatChf(totals.totalWithTipsChf)}</span>
        </div>
        {totals.tipChf > 0 && (
          <div className="text-[10px] text-text-muted text-right mt-1">
            inkl. Trinkgeld {formatChf(totals.tipChf)} (nicht fakturiert)
          </div>
        )}
      </div>

      <p className="text-[10px] text-text-muted text-center mt-4 italic">
        Bitte mit Desk-Abrechnung abgleichen
      </p>
    </div>
  );
});

function Row({
  label, count, rate, amount, dash,
}: {
  label: string; count: number | null; rate?: number; amount: number; dash?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-baseline">
      <span>{label}</span>
      <span className="tabular-nums text-right w-6">{count ?? ''}</span>
      <span className="text-text-muted text-xs w-16 text-right">
        {count != null && count > 0 && rate ? `× ${rate}` : ''}
      </span>
      <span className="tabular-nums text-right w-16">
        {dash ? '—' : amount === 0 ? '—' : formatChf(amount)}
      </span>
    </div>
  );
}
