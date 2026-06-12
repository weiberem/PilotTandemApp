import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseEinsatzplan } from './einsatzplanParser';

const FLY = 'FF9BBB59'; // Skywings "Fliegen" green

function paint(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/**
 * Build a synthetic Skywings-style matrix workbook where the FLYING signal is
 * the cell colour (green), matching the real plan:
 *   row 5: day numbers in even columns (B=1, D=2, F=3, …)
 *   pilot row 8: each day spans two columns (AM, PM)
 *     'full' → the pair is merged + green   (full day)
 *     'am'   → AM cell green only            (morning half)
 *     'pm'   → PM cell green only            (afternoon half)
 *     'busR' → AM red (a non-flying role)    (not flying)
 *     null   → empty                         (not flying)
 */
async function makeColorMatrix(
  sheetName: string,
  pilotName: string,
  perDay: Array<'full' | 'am' | 'pm' | 'busR' | null>,
  notes?: string,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  perDay.forEach((_, i) => { ws.getCell(5, 2 + i * 2).value = i + 1; });
  ws.getCell(8, 1).value = pilotName;
  perDay.forEach((p, i) => {
    const amCol = 2 + i * 2, pmCol = amCol + 1;
    if (p === 'full') {
      ws.getCell(8, amCol).value = 1;
      ws.mergeCells(8, amCol, 8, pmCol);
      paint(ws.getCell(8, amCol), FLY);
    } else if (p === 'am') {
      ws.getCell(8, amCol).value = 1;
      paint(ws.getCell(8, amCol), FLY);
    } else if (p === 'pm') {
      ws.getCell(8, pmCol).value = 1;
      paint(ws.getCell(8, pmCol), FLY);
    } else if (p === 'busR') {
      ws.getCell(8, amCol).value = 5;
      paint(ws.getCell(8, amCol), 'FFDD0806'); // red = bus/other role, not flying
    }
  });
  if (notes) ws.getCell(8, 2 + perDay.length * 2 + 4).value = notes;
  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

describe('parseEinsatzplan (role colour)', () => {
  it('only counts green ("Fliegen") cells as flying — other colours are ignored', async () => {
    const buf = await makeColorMatrix('June_2026', 'Remy', [
      'full',   // day 1: green full day
      'busR',   // day 2: red (bus) → not flying, even though it has a number
      'am',     // day 3: morning green only
      null,     // day 4: empty
      'pm',     // day 5: afternoon green only
    ]);
    const s = await parseEinsatzplan(buf, { pilotName: 'Remy' });
    expect(s['2026-06-01'].period).toBe('full');
    expect(s['2026-06-02']).toBeUndefined();
    expect(s['2026-06-03'].period).toBe('half_am');
    expect(s['2026-06-04']).toBeUndefined();
    expect(s['2026-06-05'].period).toBe('half_pm');
  });

  it('maps full/AM/PM to periods + season times', async () => {
    const buf = await makeColorMatrix('June_2026', 'Remy', ['full', 'pm', 'am']);
    const s = await parseEinsatzplan(buf, { pilotName: 'Rémy Weibel' });

    expect(s['2026-06-01'].period).toBe('full');
    expect(s['2026-06-01'].times).toContain('07:10');
    expect(s['2026-06-01'].times).toContain('17:00');

    expect(s['2026-06-02'].period).toBe('half_pm');
    expect(s['2026-06-02'].times.at(-1)).toBe('17:00');

    expect(s['2026-06-03'].period).toBe('half_am');
    expect(s['2026-06-03'].times[0]).toBe('07:10');
  });

  it('matches pilot name accent-insensitively (Remy vs Rémy)', async () => {
    const buf = await makeColorMatrix('June_2026', 'Remy', ['full', 'full', 'full']);
    const s = await parseEinsatzplan(buf, { pilotName: 'Rémy' });
    expect(Object.keys(s)).toContain('2026-06-01');
  });

  it('applies general monthly exception note ("No 7:10, 16:00, 17:00") to all days', async () => {
    const buf = await makeColorMatrix(
      'June_2026', 'Remy',
      ['full', 'full', 'full'],
      'No 7:10, 16:00, 17:00',
    );
    const s = await parseEinsatzplan(buf, { pilotName: 'Remy' });
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      expect(s[d].period).toBe('full');
      expect(s[d].times).not.toContain('07:10');
      expect(s[d].times).not.toContain('16:00');
      expect(s[d].times).not.toContain('17:00');
      expect(s[d].times).toContain('08:10');
    }
  });

  it('uses winter season times in Nov–Mar', async () => {
    const buf = await makeColorMatrix('Januar_2026', 'Remy', ['full', 'full', 'full']);
    const s = await parseEinsatzplan(buf, { pilotName: 'Remy' });
    expect(s['2026-01-01'].times).toContain('08:30');
    expect(s['2026-01-01'].times).not.toContain('07:10');
  });

  it('throws clearly when the pilot is missing', async () => {
    const buf = await makeColorMatrix('June_2026', 'Stefan', ['full', 'full', 'full']);
    await expect(parseEinsatzplan(buf, { pilotName: 'Remy' }))
      .rejects.toThrow(/pilot/i);
  });

  it('throws when the pilot has no green (flying) days', async () => {
    const buf = await makeColorMatrix('June_2026', 'Remy', ['busR', null, 'busR']);
    await expect(parseEinsatzplan(buf, { pilotName: 'Remy' }))
      .rejects.toThrow(/no scheduled days/i);
  });

  it('throws when the month cannot be read from the sheet name', async () => {
    const buf = await makeColorMatrix('Tabelle1', 'Remy', ['full', 'full', 'full']);
    await expect(parseEinsatzplan(buf, { pilotName: 'Remy' }))
      .rejects.toThrow(/month\/year/i);
  });
});
