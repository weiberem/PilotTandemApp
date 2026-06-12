import ExcelJS from 'exceljs';
import type { FlightRow, PilotRates } from './flights';
import { computeDayTotals } from './flights';

export type VatHalf = 'H1' | 'H2';

export function semesterRange(year: number, half: VatHalf): { start: string; end: string; label: string } {
  if (half === 'H1') {
    return { start: `${year}-01-01`, end: `${year}-06-30`, label: `H1 ${year} (Jan–Jun)` };
  }
  return { start: `${year}-07-01`, end: `${year}-12-31`, label: `H2 ${year} (Jul–Dec)` };
}

type MonthlyByCompany = {
  monthLabel: string;
  byCompany: Map<string, {
    flights: number; pp: number; thermal: number; noShow: number;
    revenue: number; vatAmount: number; netRevenue: number;
  }>;
};

const VAT_RATE = 0.081; // 8.1 % CH standard rate

/**
 * Aggregate the semester's flights into a per-month per-company table,
 * compute VAT split (net + VAT amount), and produce an Excel for the pilot
 * to forward to the Steuerbehörde.
 */
export async function buildVatReportXlsx({
  flights, rates, year, half, pilotName, vatRegistered,
}: {
  flights: FlightRow[];
  rates: PilotRates;
  year: number;
  half: VatHalf;
  pilotName: string;
  vatRegistered: boolean;
}): Promise<{ buffer: Buffer; totals: { revenue: number; vat: number; net: number; flights: number } }> {
  const monthIndexes = half === 'H1' ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];

  // bucket flights by month + company
  const buckets = new Map<number, Map<string, FlightRow[]>>();
  for (const i of monthIndexes) buckets.set(i, new Map());
  for (const f of flights) {
    const [y, m] = f.flight_date.split('-').map(Number);
    if (y !== year) continue;
    const mi = m - 1;
    if (!buckets.has(mi)) continue;
    const byCo = buckets.get(mi)!;
    const list = byCo.get(f.company) ?? [];
    list.push(f);
    byCo.set(f.company, list);
  }

  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rows: MonthlyByCompany[] = monthIndexes.map(mi => {
    const byCompany = new Map<string, MonthlyByCompany['byCompany'] extends Map<string, infer V> ? V : never>();
    for (const [company, list] of buckets.get(mi)!.entries()) {
      const t = computeDayTotals(list, rates);
      const revenue = t.totalChf;
      const net = vatRegistered ? revenue / (1 + VAT_RATE) : revenue;
      const vat = revenue - net;
      byCompany.set(company, {
        flights: t.flightsBilled,
        pp: t.ppCount,
        thermal: t.thermalCount,
        noShow: t.noShowCount,
        revenue, vatAmount: vat, netRevenue: net,
      });
    }
    return { monthLabel: `${SHORT[mi]} ${year}`, byCompany };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TandemLog';
  const ws = wb.addWorksheet('VAT report');
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 14;

  ws.getCell('A1').value = `VAT report — ${pilotName} — ${half} ${year}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells('A1:F1');

  ws.getCell('A2').value = vatRegistered
    ? `VAT-pflichtig · MWST-Satz 8.1 %`
    : `Nicht MWST-pflichtig — Bruttoumsatz nur informativ`;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF888888' } };
  ws.mergeCells('A2:F2');

  const headers = ['Month', 'Company', 'Flights', 'Gross CHF', 'VAT CHF', 'Net CHF'];
  headers.forEach((h, i) => {
    const c = ws.getRow(4).getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: i < 2 ? 'left' : 'right' };
    c.border = { bottom: { style: 'thin' } };
  });

  let rowIdx = 5;
  const totals = { revenue: 0, vat: 0, net: 0, flights: 0 };
  for (const month of rows) {
    if (month.byCompany.size === 0) {
      ws.getRow(rowIdx).getCell(1).value = month.monthLabel;
      ws.getRow(rowIdx).getCell(2).value = '—';
      ws.getRow(rowIdx).getCell(2).font = { color: { argb: 'FFAAAAAA' } };
      rowIdx++;
      continue;
    }
    let firstForMonth = true;
    for (const [company, t] of month.byCompany.entries()) {
      const r = ws.getRow(rowIdx);
      r.getCell(1).value = firstForMonth ? month.monthLabel : '';
      r.getCell(2).value = company;
      r.getCell(3).value = t.flights;
      r.getCell(4).value = t.revenue;
      r.getCell(5).value = t.vatAmount;
      r.getCell(6).value = t.netRevenue;
      for (let c = 3; c <= 6; c++) r.getCell(c).numFmt = '#,##0.00';
      firstForMonth = false;
      totals.revenue += t.revenue;
      totals.vat += t.vatAmount;
      totals.net += t.netRevenue;
      totals.flights += t.flights;
      rowIdx++;
    }
  }

  // Totals row
  const totalRow = ws.getRow(rowIdx + 1);
  totalRow.getCell(2).value = `Total ${half}`;
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = totals.flights;
  totalRow.getCell(4).value = totals.revenue;
  totalRow.getCell(5).value = totals.vat;
  totalRow.getCell(6).value = totals.net;
  for (let c = 3; c <= 6; c++) {
    totalRow.getCell(c).numFmt = '#,##0.00';
    totalRow.getCell(c).font = { bold: true };
    totalRow.getCell(c).border = { top: { style: 'thin' } };
  }

  const out = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(out as ArrayBuffer), totals };
}
