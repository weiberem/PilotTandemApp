import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseEinsatzplan } from './einsatzplanParser';

/**
 * Build a synthetic Skywings-style matrix workbook:
 *   sheet name encodes month/year
 *   row 4: weekday labels (cosmetic)
 *   row 5: day numbers in even columns (B=1, D=2, F=3, ...)
 *   pilot row: two shift cells per day
 */
async function makeMatrix(sheetName: string, pilotName: string, perDay: Array<[unknown, unknown]>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  // day-number header (row 5): day d at column 2d
  const dayRow = ws.getRow(5);
  perDay.forEach((_, i) => { dayRow.getCell(2 + i * 2).value = i + 1; });
  dayRow.commit();
  // pilot row (row 8)
  const pRow = ws.getRow(8);
  pRow.getCell(1).value = pilotName;
  perDay.forEach(([s1, s2], i) => {
    if (s1 !== null && s1 !== '') pRow.getCell(2 + i * 2).value = s1 as ExcelJS.CellValue;
    if (s2 !== null && s2 !== '') pRow.getCell(3 + i * 2).value = s2 as ExcelJS.CellValue;
  });
  pRow.commit();
  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

describe('parseEinsatzplan (matrix format)', () => {
  it('maps both/AM/PM shifts to periods + season times', async () => {
    const buf = await makeMatrix('June_2026', 'Remy', [
      [1, 1],     // day 1 full
      ['', 1],    // day 2 PM
      [1, ''],    // day 3 AM
      ['', ''],   // day 4 not scheduled
      [0.5, 0.5], // day 5 full (halves still count as present)
    ]);
    const s = await parseEinsatzplan(buf, { pilotName: 'Rémy Weibel' });

    expect(s['2026-06-01'].period).toBe('full');
    expect(s['2026-06-01'].times).toContain('07:10');
    expect(s['2026-06-01'].times).toContain('17:00');

    expect(s['2026-06-02'].period).toBe('half_pm');
    expect(s['2026-06-02'].times.at(-1)).toBe('17:00');

    expect(s['2026-06-03'].period).toBe('half_am');
    expect(s['2026-06-03'].times[0]).toBe('07:10');

    expect(s['2026-06-04']).toBeUndefined();   // both empty → skipped

    expect(s['2026-06-05'].period).toBe('full');
  });

  it('matches pilot name accent-insensitively (Remy vs Rémy)', async () => {
    const buf = await makeMatrix('June_2026', 'Remy', [[1, 1]]);
    const s = await parseEinsatzplan(buf, { pilotName: 'Rémy' });
    expect(Object.keys(s)).toContain('2026-06-01');
  });

  it('honours No 7:10 / No 17:00 exception text in a shift cell', async () => {
    const buf = await makeMatrix('June_2026', 'Remy', [
      ['No 7:10', 1],     // full day but no early
      [1, 'No 17:00'],    // full day but no late
    ]);
    const s = await parseEinsatzplan(buf, { pilotName: 'Remy' });
    expect(s['2026-06-01'].period).toBe('full');
    expect(s['2026-06-01'].times).not.toContain('07:10');
    expect(s['2026-06-02'].times).not.toContain('17:00');
  });

  it('uses winter season times in Nov–Mar', async () => {
    const buf = await makeMatrix('Januar_2026', 'Remy', [[1, 1]]);
    const s = await parseEinsatzplan(buf, { pilotName: 'Remy' });
    expect(s['2026-01-01'].times).toContain('08:30');
    expect(s['2026-01-01'].times).not.toContain('07:10');
  });

  it('throws clearly when the pilot is missing', async () => {
    const buf = await makeMatrix('June_2026', 'Stefan', [[1, 1]]);
    await expect(parseEinsatzplan(buf, { pilotName: 'Remy' }))
      .rejects.toThrow(/pilot/i);
  });

  it('throws when the month cannot be read from the sheet name', async () => {
    const buf = await makeMatrix('Tabelle1', 'Remy', [[1, 1]]);
    await expect(parseEinsatzplan(buf, { pilotName: 'Remy' }))
      .rejects.toThrow(/month\/year/i);
  });
});
