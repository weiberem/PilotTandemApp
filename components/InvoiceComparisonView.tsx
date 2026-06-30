'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Send, FileSpreadsheet, FileText } from 'lucide-react';
import { InvoicePreview } from './InvoicePreview';
import { computeDayTotals, type FlightRow, type PilotRates } from '@/lib/flights';
import {
  type InvoiceCompanyInfo, type InvoiceDayRow, type InvoicePilotInfo,
  type InvoiceTotals, monthLabelDe,
} from '@/lib/invoice';
import { formatChf, formatDateDe } from '@/lib/utils';

type Props = {
  pilot: InvoicePilotInfo;
  company: InvoiceCompanyInfo;
  companyKey: string;
  rates: PilotRates;
  monthFirst: string;
  rows: InvoiceDayRow[];
  totals: InvoiceTotals;
  flights: FlightRow[];
  alreadySent: { invoiceNumber: string | null; sentAt: string | null };
  verification: {
    total: number;
    verified: number;
    unverifiedDates: string[];
    ready: boolean;
  };
};

export function InvoiceComparisonView(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const verifyReady = p.verification.ready;
  const verifyMissing = p.verification.unverifiedDates.length;

  const daysWithFlights = groupByDate(p.flights, p.rates);

  function previewHref(format: 'pdf' | 'xlsx') {
    return `/api/invoice/generate?month=${encodeURIComponent(p.monthFirst)}&company=${encodeURIComponent(p.companyKey)}&format=${format}`;
  }

  async function doSend() {
    setMsg(null);
    setConfirming(false);
    startTransition(async () => {
      const r = await fetch('/api/invoice/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month: p.monthFirst, company: p.companyKey }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const text = data.detail ? `${data.error ?? 'Send failed'}: ${data.detail}` : (data.error ?? 'Send failed');
        setMsg({ kind: 'err', text });
        return;
      }
      const driveNote = data.drive_uploaded ? ' Drive ✓' : ' (Drive skipped)';
      setMsg({ kind: 'ok', text: `Invoice ${data.invoice_number} sent.${driveNote}` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 border-l-4 border-l-warning text-sm">
        Please review your statement before sending.
      </div>

      {!verifyReady && p.verification.total > 0 && (
        <div className="card p-3 border-l-4 border-l-danger text-sm space-y-1">
          <div className="font-semibold">
            {verifyMissing} of {p.verification.total} flight day{p.verification.total === 1 ? '' : 's'} not yet verified
          </div>
          <p className="text-text-muted text-xs">
            Sending is locked until every flight day is reconciled with the Skywings desk day sheet and verified.
          </p>
          <ul className="text-xs text-text-muted mt-1 space-y-0.5">
            {p.verification.unverifiedDates.slice(0, 6).map(d => (
              <li key={d}>
                <a href={`/summary?date=${d}`} className="text-primary underline-offset-2 hover:underline">
                  {d.split('-').reverse().join('.')}.
                </a>
              </li>
            ))}
            {p.verification.unverifiedDates.length > 6 && (
              <li className="text-text-muted">… and {p.verification.unverifiedDates.length - 6} more</li>
            )}
          </ul>
        </div>
      )}

      {p.alreadySent.invoiceNumber && (
        <div className="card p-3 border-l-4 border-l-success text-sm">
          ✓ Already sent as <span className="font-mono">{p.alreadySent.invoiceNumber}</span>
          {p.alreadySent.sentAt && ` on ${formatDateDe(p.alreadySent.sentAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}`}.
          Sending again issues a new invoice number.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: invoice preview */}
        <div>
          <h2 className="font-display font-semibold mb-2">Invoice — Preview</h2>
          <InvoicePreview
            pilot={p.pilot} company={p.company} rates={p.rates}
            monthFirst={p.monthFirst}
            invoiceNumber={p.alreadySent.invoiceNumber ?? 'assigned on send'}
            invoiceDate={new Date().toISOString().slice(0, 10)}
            rows={p.rows} totals={p.totals}
          />
        </div>

        {/* Right: TandemLog comparison data */}
        <div>
          <h2 className="font-display font-semibold mb-2">TandemLog — Day by day</h2>
          <div className="card p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            {daysWithFlights.length === 0 ? (
              <p className="text-text-muted text-sm">No flights logged in this month.</p>
            ) : daysWithFlights.map(({ date, flights, totals }) => (
              <div key={date} className="border-b border-border pb-2 last:border-b-0">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold">{formatDateDe(date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                  <span className="font-mono text-sm">{formatChf(totals.totalChf)}</span>
                </div>
                <ul className="text-xs text-text-muted mt-1 space-y-0.5">
                  {flights.map(f => (
                    <li key={f.id} className="flex justify-between">
                      <span className="font-mono">{f.trip_time}</span>
                      <span>
                        {f.is_no_show ? 'No-Show' :
                          [f.photo_status !== 'none' && f.photo_status, f.is_double_airtime && 'Thermal']
                            .filter(Boolean).join(' · ') || 'Flight'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="border-t-2 border-text pt-2 flex justify-between font-semibold">
              <span>Month total</span>
              <span className="font-mono">{formatChf(p.totals.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <a href={previewHref('pdf')} target="_blank" rel="noreferrer" className="btn-ghost border border-border inline-flex">
            <FileText className="w-4 h-4 mr-2" /> PDF preview
          </a>
          <a href={previewHref('xlsx')} className="btn-ghost border border-border inline-flex">
            <FileSpreadsheet className="w-4 h-4 mr-2" /> XLSX download
          </a>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">From <span className="font-mono">{p.pilot.full_name}</span>: send invoice?</span>
            <button onClick={() => setConfirming(false)} className="btn-ghost border border-border">Cancel</button>
            <button onClick={doSend} disabled={pending} className="btn-primary">
              <Send className="w-4 h-4 mr-2" /> {pending ? 'Sending…' : 'Yes, send'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={p.totals.amount <= 0 || !verifyReady}
            className="btn-primary"
            title={
              p.totals.amount <= 0 ? 'Nothing to invoice'
              : !verifyReady ? `${verifyMissing} day${verifyMissing === 1 ? '' : 's'} not yet verified`
              : ''
            }
          >
            <Send className="w-4 h-4 mr-2" /> Send invoice
          </button>
        )}
      </div>

      {msg && (
        <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>
      )}

      <p className="text-xs text-text-muted text-center">
        {monthLabelDe(p.monthFirst)} · {p.company.name}
      </p>
    </div>
  );
}

function groupByDate(flights: FlightRow[], rates: PilotRates) {
  const map = new Map<string, FlightRow[]>();
  for (const f of flights) {
    const list = map.get(f.flight_date) ?? [];
    list.push(f);
    map.set(f.flight_date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, flights: list, totals: computeDayTotals(list, rates) }));
}
