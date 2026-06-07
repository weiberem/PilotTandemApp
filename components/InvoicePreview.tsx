import {
  applyVat, type InvoiceCompanyInfo, type InvoiceDayRow, type InvoicePilotInfo,
  type InvoiceTotals, monthLabelDe,
} from '@/lib/invoice';
import type { PilotRates } from '@/lib/flights';

type Props = {
  pilot: InvoicePilotInfo;
  company: InvoiceCompanyInfo;
  rates: PilotRates;
  monthFirst: string;
  invoiceNumber: string;
  invoiceDate: string;
  rows: InvoiceDayRow[];
  totals: InvoiceTotals;
};

export function InvoicePreview(p: Props) {
  const { vat, net } = applyVat(p.totals.amount, p.pilot.vat_rate);
  return (
    <div className="bg-white border border-border rounded-xl p-8 text-sm font-mono">
      <header className="flex justify-between items-start mb-8">
        <div>
          <div className="font-bold text-base">{p.pilot.full_name}</div>
          {p.pilot.address_line1 && <div>{p.pilot.address_line1}</div>}
          {p.pilot.address_line2 && <div>{p.pilot.address_line2}</div>}
          <div>{[p.pilot.postal_code, p.pilot.city].filter(Boolean).join(' ')}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-base">{p.company.name}</div>
          {p.company.address && <div>{p.company.address}</div>}
        </div>
      </header>

      <div className="flex justify-between items-end mb-4">
        <div>
          <div className="text-lg font-display font-bold">ABRECHNUNG</div>
          <div className="italic">{monthLabelDe(p.monthFirst)}</div>
        </div>
        <div className="text-right">
          <div>Nr. <span className="font-bold">{p.invoiceNumber}</span></div>
          <div>{p.invoiceDate}</div>
        </div>
      </div>

      <table className="w-full text-xs border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
        <thead>
          <tr className="border-b-2 border-text bg-bg-subtle/60">
            <th className="text-left py-1 px-1.5">Datum</th>
            <th className="text-center px-1.5">Flüge à CHF {p.rates.flight_rate_chf}.-</th>
            <th className="text-center px-1.5">F/V à CHF {p.rates.photo_prepaid_rate_chf}.-</th>
            <th className="text-center px-1.5">Thermal à CHF {p.rates.thermal_rate_chf}.-</th>
            <th className="text-center px-1.5">No Show à CHF {p.rates.no_show_rate_chf}.-</th>
            <th className="text-right px-1.5">Betrag CHF</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map(r => (
            <tr key={r.day} className={r.amount === 0 ? 'text-text-muted' : ''}>
              <td className="py-0.5 px-1.5">{String(r.day).padStart(2, '0')}</td>
              <td className="text-center px-1.5">{r.flights || ''}</td>
              <td className="text-center px-1.5">{r.pp || ''}</td>
              <td className="text-center px-1.5">{r.thermal || ''}</td>
              <td className="text-center px-1.5">{r.noShow || ''}</td>
              <td className="text-right px-1.5">{r.amount || ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-text font-bold bg-bg-subtle/60">
            <td className="py-1 px-1.5">Total</td>
            <td className="text-center px-1.5">{p.totals.flights}</td>
            <td className="text-center px-1.5">{p.totals.pp}</td>
            <td className="text-center px-1.5">{p.totals.thermal}</td>
            <td className="text-center px-1.5">{p.totals.noShow}</td>
            <td className="text-right px-1.5">CHF {p.totals.amount.toFixed(0)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="flex justify-between mt-6">
        <div>
          <div className="font-bold">Bankverbindung:</div>
          <div>IBAN: {p.pilot.iban ?? '—'}</div>
        </div>
        <div className="text-right">
          <div>Betrag inklusive {(p.pilot.vat_rate * 100).toFixed(1)}% MwSt.</div>
          {p.pilot.vat_number && <div>MwSt.-Nr.: {p.pilot.vat_number}</div>}
          <div className="text-[10px] text-text-muted mt-1">
            Netto {net.toFixed(2)} · MwSt {vat.toFixed(2)}
          </div>
        </div>
      </footer>
    </div>
  );
}
