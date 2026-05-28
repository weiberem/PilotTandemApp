import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseEinsatzplan } from './einsatzplanParser';

async function makeWorkbook(rows: (string | Date)[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plan');
  for (const r of rows) ws.addRow(r);
  return await wb.xlsx.writeBuffer() as ArrayBuffer;
}

describe('parseEinsatzplan', () => {
  it('parses full / half-am / half-pm / exclusions', async () => {
    const buf = await makeWorkbook([
      ['Datum', 'Weibel', 'Müller'],
      [new Date(Date.UTC(2025, 5, 1)), 'GT', 'frei'],          // summer full
      [new Date(Date.UTC(2025, 5, 2)), 'VM', ''],              // half AM
      [new Date(Date.UTC(2025, 5, 3)), 'NM', ''],              // half PM
      [new Date(Date.UTC(2025, 5, 4)), 'GT, kein 07', ''],     // full minus 07:10
      [new Date(Date.UTC(2025, 5, 5)), 'GT, kein 17', ''],     // full minus 17:00
    ]);

    const schedule = await parseEinsatzplan(buf, { pilotName: 'Rémy Weibel' });

    expect(schedule['2025-06-01'].period).toBe('full');
    expect(schedule['2025-06-01'].times).toContain('07:10');
    expect(schedule['2025-06-01'].times).toContain('17:00');

    expect(schedule['2025-06-02'].period).toBe('half_am');
    expect(schedule['2025-06-02'].times[0]).toBe('07:10');

    expect(schedule['2025-06-03'].period).toBe('half_pm');
    expect(schedule['2025-06-03'].times.at(-1)).toBe('17:00');

    expect(schedule['2025-06-04'].times).not.toContain('07:10');
    expect(schedule['2025-06-04'].times).toContain('17:00');

    expect(schedule['2025-06-05'].times).toContain('07:10');
    expect(schedule['2025-06-05'].times).not.toContain('17:00');

    expect(schedule['2025-06-01'].times).toHaveLength(9); // all 9 summer times
    expect(schedule['2025-06-06']).toBeUndefined();      // "frei" → skipped
  });

  it('falls back to winter season times in Nov–Mar', async () => {
    const buf = await makeWorkbook([
      ['Datum', 'Weibel'],
      [new Date(Date.UTC(2025, 0, 15)), 'GT'],
    ]);
    const s = await parseEinsatzplan(buf, { pilotName: 'Weibel' });
    expect(s['2025-01-15'].times).toContain('08:30');
    expect(s['2025-01-15'].times).not.toContain('07:10'); // winter has no 07:10
  });

  it('throws clearly when the pilot column is missing', async () => {
    const buf = await makeWorkbook([
      ['Datum', 'Müller'],
      [new Date(Date.UTC(2025, 5, 1)), 'GT'],
    ]);
    await expect(parseEinsatzplan(buf, { pilotName: 'Weibel' }))
      .rejects.toThrow(/pilot/i);
  });
});
