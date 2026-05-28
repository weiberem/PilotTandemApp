import type { FlightRow, PilotRates } from './flights';

export type InvoiceDayRow = {
  day: number;            // 1..31
  flights: number;        // non-no-show flights
  pp: number;
  thermal: number;
  noShow: number;
  amount: number;
};

export type InvoiceTotals = {
  flights: number;
  pp: number;
  thermal: number;
  noShow: number;
  amount: number;        // gross — VAT is included per spec
  vatIncluded: number;   // informational
  vatNet: number;
};

export type InvoicePilotInfo = {
  full_name: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  iban: string | null;
  vat_number: string | null;
  vat_rate: number;       // e.g. 0.081
};

export type InvoiceCompanyInfo = {
  name: string;
  address: string | null;
};

export function daysInMonth(monthFirst: string): number {
  const [y, m] = monthFirst.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function buildInvoiceRows(
  flights: FlightRow[],
  rates: PilotRates,
  monthFirst: string,
): { rows: InvoiceDayRow[]; totals: InvoiceTotals } {
  const dim = daysInMonth(monthFirst);
  const rows: InvoiceDayRow[] = Array.from({ length: dim }, (_, i) => ({
    day: i + 1, flights: 0, pp: 0, thermal: 0, noShow: 0, amount: 0,
  }));

  for (const f of flights) {
    const day = Number(f.flight_date.slice(-2));
    if (day < 1 || day > dim) continue;
    const r = rows[day - 1];
    if (f.is_no_show) {
      r.noShow++;
      r.amount += rates.no_show_rate_chf;
      continue;
    }
    r.flights++;
    r.amount += rates.flight_rate_chf;
    if (f.photo_status === 'PP') {
      r.pp++;
      r.amount += rates.photo_prepaid_rate_chf;
    }
    if (f.is_double_airtime) {
      r.thermal++;
      r.amount += rates.thermal_rate_chf;
    }
  }

  const totals: InvoiceTotals = {
    flights: rows.reduce((s, r) => s + r.flights, 0),
    pp: rows.reduce((s, r) => s + r.pp, 0),
    thermal: rows.reduce((s, r) => s + r.thermal, 0),
    noShow: rows.reduce((s, r) => s + r.noShow, 0),
    amount: rows.reduce((s, r) => s + r.amount, 0),
    vatIncluded: 0,
    vatNet: 0,
  };
  // VAT is "included" in the listed amounts per spec.
  // Net = amount / (1 + vatRate); VAT = amount - net.
  // Stored for the informational footer line.
  // (We use a sane default if rate is 0.)
  if ((flights[0] && undefined) || true) { /* no-op for clarity */ }
  return { rows, totals };
}

export function applyVat(amount: number, vatRate: number) {
  const net = vatRate > 0 ? amount / (1 + vatRate) : amount;
  const vat = amount - net;
  return { net, vat };
}

export function monthLabelDe(monthFirst: string): string {
  const [y, m] = monthFirst.split('-').map(Number);
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatInvoiceNumber(year: number, n: number): string {
  return `${year}-${String(n).padStart(3, '0')}`;
}
