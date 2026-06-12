import ExcelJS from 'exceljs';
import type { FlightRow } from './flights';

/**
 * Reproduces the pilot's hand-maintained flight log layout (per their screenshot):
 *   row 1: legend with three coloured cells — Skyw (orange) | Twin (blue) | Alpin (yellow)
 *   row 2: column headers — # | Datum | Time | Photo | Paid | NoS | DA | Notes
 *   row 3..n: one row per flight; the Datum cell is filled with the company colour
 *
 * Photo column values:
 *   none → "No" (red bg)
 *   PP   → "Yes PP" (light orange)
 *   CC   → "Yes CC" (light green)
 *   C    → "Yes C"  (dark green)
 *
 * Paid column captures any tip note (e.g. "Tip cc 40"); NoS/DA are "x" markers.
 */

const COMPANY_FILL = {
  skyw: 'FFFFD8B1',    // soft orange
  twin: 'FFCFE2F3',    // soft blue
  alpin: 'FFFFF2CC',   // soft yellow
  other: 'FFEEEEEE',
} as const;

function companyFill(company: string): string {
  const c = company.toLowerCase();
  if (c.startsWith('skyw')) return COMPANY_FILL.skyw;
  if (c.startsWith('twin')) return COMPANY_FILL.twin;
  if (c.startsWith('alpin')) return COMPANY_FILL.alpin;
  return COMPANY_FILL.other;
}

const PHOTO_VALUE: Record<FlightRow['photo_status'], { label: string; fill: string }> = {
  none: { label: 'No',     fill: 'FFEA9999' },
  PP:   { label: 'Yes PP', fill: 'FFFCE5CD' },
  CC:   { label: 'Yes CC', fill: 'FFD9EAD3' },
  C:    { label: 'Yes C',  fill: 'FF6AA84F' },
};

function fmtDateCh(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export async function generateMonthlyBackupXlsx({
  flights, monthFirst, pilotName,
}: {
  flights: FlightRow[];
  monthFirst: string;     // YYYY-MM-01
  pilotName: string;
}): Promise<Buffer> {
  return generateRangeBackupXlsx({
    pilotName,
    months: [{ monthFirst, flights }],
  });
}

/**
 * Multi-month workbook: one worksheet per month with the same hand-layout.
 * Sheets are named "Jan 2026" etc. Use this for yearly or multi-month
 * downloads — keeps each month visually identical to the single-month
 * backup.
 */
export async function generateRangeBackupXlsx({
  pilotName, months,
}: {
  pilotName: string;
  months: Array<{ monthFirst: string; flights: FlightRow[] }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TandemLog';
  wb.created = new Date();

  for (const { monthFirst, flights } of months) {
    const sheetName = monthLabelShort(monthFirst);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 2 }],
    });
    populateMonthSheet(ws, flights, monthFirst, pilotName);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function populateMonthSheet(
  ws: ExcelJS.Worksheet,
  flights: FlightRow[],
  monthFirst: string,
  pilotName: string,
): void {
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 9;
  ws.getColumn(4).width = 11;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 6;
  ws.getColumn(7).width = 6;
  ws.getColumn(8).width = 36;

  // Row 1: legend — Skyw / Twin / Alpin coloured cells.
  ws.getCell('A1').value = pilotName ?? '';
  ws.getCell('A1').font = { italic: true, color: { argb: 'FF888888' } };

  const legends: Array<[string, string]> = [
    ['B1', 'Skyw'],
    ['C1', 'Twin'],
    ['D1', 'Alpin'],
  ];
  const legendFills = [COMPANY_FILL.skyw, COMPANY_FILL.twin, COMPANY_FILL.alpin];
  legends.forEach(([addr, label], i) => {
    const c = ws.getCell(addr);
    c.value = label;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: legendFills[i] } };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  ws.getCell('E1').value = monthLabelEn(monthFirst);
  ws.getCell('E1').font = { bold: true };

  // Row 2: column headers.
  const headers = ['#', 'Datum', 'Time', 'Photo', 'Paid', 'NoS', 'DA', 'Notes'];
  const headerRow = ws.getRow(2);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: i === 7 ? 'left' : 'center' };
    c.border = { bottom: { style: 'thin' } };
  });

  // Sort flights chronologically and number them.
  const sorted = [...flights].sort((a, b) =>
    a.flight_date.localeCompare(b.flight_date) || a.trip_time.localeCompare(b.trip_time),
  );

  sorted.forEach((f, idx) => {
    const r = ws.getRow(3 + idx);
    r.getCell(1).value = idx + 1;

    // Datum (formatted Swiss) — fill colour reflects company.
    const datumCell = r.getCell(2);
    datumCell.value = fmtDateCh(f.flight_date);
    datumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: companyFill(f.company) } };

    r.getCell(3).value = f.trip_time;
    r.getCell(3).alignment = { horizontal: 'center' };

    // Photo
    const photo = PHOTO_VALUE[f.photo_status];
    const photoCell = r.getCell(4);
    photoCell.value = photo.label;
    photoCell.alignment = { horizontal: 'center' };
    photoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: photo.fill } };

    // Paid (tip note)
    const tip = Number(f.tip_chf ?? 0);
    if (tip > 0) {
      const photoTag = f.photo_status === 'none' ? '' : f.photo_status.toLowerCase();
      r.getCell(5).value = photoTag ? `Tip ${photoTag} ${tip.toFixed(0)}` : `Tip ${tip.toFixed(0)}`;
    }

    if (f.is_no_show) {
      const c = r.getCell(6);
      c.value = 'x';
      c.alignment = { horizontal: 'center' };
      c.font = { bold: true, color: { argb: 'FFCC0000' } };
    }
    if (f.is_double_airtime) {
      const c = r.getCell(7);
      c.value = 'x';
      c.alignment = { horizontal: 'center' };
      c.font = { bold: true, color: { argb: 'FF6AA84F' } };
    }
    if (f.notes) {
      r.getCell(8).value = f.notes;
      r.getCell(8).alignment = { wrapText: true };
    }
  });
}

function monthLabelShort(monthFirst: string): string {
  const [y, m] = monthFirst.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

function monthLabelEn(monthFirst: string): string {
  const [y, m] = monthFirst.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}
