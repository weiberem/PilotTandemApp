import ExcelJS from 'exceljs';
import {
  applyVat, type InvoiceCompanyInfo, type InvoiceDayRow, type InvoicePilotInfo,
  type InvoiceTotals, monthLabelDe,
} from './invoice';
import type { PilotRates } from './flights';

export type InvoiceXlsxArgs = {
  pilot: InvoicePilotInfo;
  company: InvoiceCompanyInfo;
  rates: PilotRates;
  monthFirst: string;
  invoiceNumber: string;
  invoiceDate: string;       // ISO YYYY-MM-DD
  rows: InvoiceDayRow[];
  totals: InvoiceTotals;
};

export async function generateInvoiceXlsx(args: InvoiceXlsxArgs): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TandemLog';
  wb.created = new Date();

  const ws = wb.addWorksheet('Rechnung', {
    pageSetup: { paperSize: 9, orientation: 'portrait', margins: {
      left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3,
    }},
  });

  // Column widths.
  ws.getColumn(1).width = 8;   // Datum
  ws.getColumn(2).width = 18;  // Flüge
  ws.getColumn(3).width = 16;  // F/V
  ws.getColumn(4).width = 18;  // Thermal
  ws.getColumn(5).width = 18;  // No Show
  ws.getColumn(6).width = 16;  // Betrag

  // --- Header block: pilot (left) / company (right) ---
  ws.getCell('A1').value = args.pilot.full_name;
  ws.getCell('A1').font = { bold: true, size: 12 };
  ws.getCell('A2').value = args.pilot.address_line1 ?? '';
  ws.getCell('A3').value = [args.pilot.postal_code, args.pilot.city].filter(Boolean).join(' ');
  if (args.pilot.address_line2) {
    ws.getCell('A4').value = args.pilot.address_line2;
  }

  ws.getCell('E1').value = args.company.name;
  ws.getCell('E1').font = { bold: true, size: 12 };
  ws.getCell('E2').value = args.company.address ?? '';
  ws.getCell('E1').alignment = { horizontal: 'right' };
  ws.getCell('E2').alignment = { horizontal: 'right' };

  ws.getCell('A6').value = 'ABRECHNUNG';
  ws.getCell('A6').font = { bold: true, size: 14 };
  ws.getCell('E6').value = `Nr. ${args.invoiceNumber}`;
  ws.getCell('E6').alignment = { horizontal: 'right' };

  ws.getCell('A7').value = monthLabelDe(args.monthFirst);
  ws.getCell('A7').font = { italic: true };
  ws.getCell('E7').value = args.invoiceDate;
  ws.getCell('E7').alignment = { horizontal: 'right' };

  // --- Table headers ---
  const headerRowIdx = 9;
  const headers = [
    'Datum',
    `Flüge à CHF ${args.rates.flight_rate_chf}.-`,
    `F/V à CHF ${args.rates.photo_prepaid_rate_chf}.-`,
    `Thermal à CHF ${args.rates.thermal_rate_chf}.-`,
    `No Show à CHF ${args.rates.no_show_rate_chf}.-`,
    'Betrag in CHF',
  ];
  const headerRow = ws.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', wrapText: true };
    c.border = { bottom: { style: 'thin' } };
  });
  headerRow.height = 32;

  // --- Day rows ---
  args.rows.forEach((r, idx) => {
    const rowIdx = headerRowIdx + 1 + idx;
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = String(r.day).padStart(2, '0');
    row.getCell(2).value = r.flights || '';
    row.getCell(3).value = r.pp || '';
    row.getCell(4).value = r.thermal || '';
    row.getCell(5).value = r.noShow || '';
    row.getCell(6).value = r.amount; // numeric
    row.getCell(6).numFmt = '#,##0';
    for (let c = 1; c <= 6; c++) {
      row.getCell(c).alignment = { horizontal: c === 1 ? 'left' : c === 6 ? 'right' : 'center' };
    }
  });

  // --- Total row ---
  const totalRowIdx = headerRowIdx + 1 + args.rows.length;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.getCell(1).value = 'Total';
  totalRow.getCell(2).value = args.totals.flights;
  totalRow.getCell(3).value = args.totals.pp;
  totalRow.getCell(4).value = args.totals.thermal;
  totalRow.getCell(5).value = args.totals.noShow;
  totalRow.getCell(6).value = args.totals.amount;
  totalRow.getCell(6).numFmt = '"CHF" #,##0';
  for (let c = 1; c <= 6; c++) {
    totalRow.getCell(c).font = { bold: true };
    totalRow.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    totalRow.getCell(c).alignment = { horizontal: c === 1 ? 'left' : c === 6 ? 'right' : 'center' };
  }

  // --- Footer: VAT + IBAN ---
  const footerStart = totalRowIdx + 3;
  ws.getCell(`E${footerStart}`).value =
    `Betrag inklusive ${(args.pilot.vat_rate * 100).toFixed(1)}% MwSt.`;
  ws.getCell(`E${footerStart}`).alignment = { horizontal: 'right' };
  if (args.pilot.vat_number) {
    ws.getCell(`E${footerStart + 1}`).value = `MwSt.-Nr.: ${args.pilot.vat_number}`;
    ws.getCell(`E${footerStart + 1}`).alignment = { horizontal: 'right' };
  }

  ws.getCell(`A${footerStart + 3}`).value = 'Bankverbindung:';
  ws.getCell(`A${footerStart + 3}`).font = { bold: true };
  ws.getCell(`A${footerStart + 4}`).value = `IBAN: ${args.pilot.iban ?? ''}`;

  const { vat, net } = applyVat(args.totals.amount, args.pilot.vat_rate);
  ws.getCell(`E${footerStart + 3}`).value = `Netto: ${net.toFixed(2)} CHF`;
  ws.getCell(`E${footerStart + 3}`).alignment = { horizontal: 'right' };
  ws.getCell(`E${footerStart + 4}`).value = `MwSt: ${vat.toFixed(2)} CHF`;
  ws.getCell(`E${footerStart + 4}`).alignment = { horizontal: 'right' };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
