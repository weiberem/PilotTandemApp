import ExcelJS from 'exceljs';
import {
  SUMMER_TRIP_TIMES, WINTER_TRIP_TIMES, OPTIONAL_SUMMER_TIMES, resolveSeason,
} from './tripTimes';

/**
 * The Skywings Einsatzplan format isn't fully specified — we make it robust
 * to common shapes. The parser:
 *
 *   1. Loads the workbook from an Excel buffer.
 *   2. Scans all worksheets for the first row containing a "Datum" header
 *      (or any cell parseable as a Date in column A).
 *   3. Looks for a column whose header matches the pilot's name
 *      (case-insensitive, partial match on first/last name).
 *   4. For each data row, reads the cell at (date row × pilot column):
 *        - empty / "frei" / "-" → not working
 *        - "GT" / "Ganztag" / "X" / "1" → full day, all season times
 *        - "VM" / "AM" / "1/2 V" → half day morning (first half of season times)
 *        - "NM" / "PM" / "1/2 N" → half day afternoon (second half)
 *        - "07:10" / "no 07" / "kein 07" → exclude optional 07:10
 *        - "17:00" / "no 17" / "kein 17" → exclude optional 17:00
 *      Letters/markers can be combined (e.g. "GT, kein 17").
 *
 * Returns a schedule keyed by ISO date with the resolved trip times so the
 * /log smart pre-fill can use them directly.
 */
export type ParsedScheduleEntry = {
  period: 'full' | 'half_am' | 'half_pm';
  times: string[];
};

export type ParsedSchedule = Record<string, ParsedScheduleEntry>;

export type ParseOptions = {
  pilotName: string;
  seasonOverride?: 'summer' | 'winter' | null;
  /** Optional explicit overrides if the auto-detection misses. */
  columnMapping?: {
    sheetName?: string;
    dateColumn?: number;        // 1-based
    pilotColumn?: number;       // 1-based
    headerRow?: number;         // 1-based
  };
};

const FULL_MARKERS = ['gt', 'ganztag', 'x', 'ja', 'yes', '1', '✓', 'full'];
const AM_MARKERS = ['vm', 'am', '1/2 v', '1/2v', 'halb v', 'half am', '½v', '½ v'];
const PM_MARKERS = ['nm', 'pm', '1/2 n', '1/2n', 'halb n', 'half pm', '½n', '½ n'];
const NO_07_MARKERS = ['07:10', 'no 07', 'kein 07', '-07'];
const NO_17_MARKERS = ['17:00', 'no 17', 'kein 17', '-17'];

export async function parseEinsatzplan(
  buffer: ArrayBuffer | Buffer,
  opts: ParseOptions,
): Promise<ParsedSchedule> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const sheet = opts.columnMapping?.sheetName
    ? wb.getWorksheet(opts.columnMapping.sheetName)
    : wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in Einsatzplan');

  // Find header row.
  const headerRow = opts.columnMapping?.headerRow ?? findHeaderRow(sheet);
  if (!headerRow) throw new Error('Could not locate header row (no "Datum" column found).');

  const dateCol = opts.columnMapping?.dateColumn ?? findDateColumn(sheet, headerRow);
  const pilotCol = opts.columnMapping?.pilotColumn ?? findPilotColumn(sheet, headerRow, opts.pilotName);
  if (!pilotCol) {
    throw new Error(`Could not find a column for pilot "${opts.pilotName}". Configure pilotColumn in Settings.`);
  }

  const out: ParsedSchedule = {};
  const lastRow = sheet.lastRow?.number ?? headerRow;
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const dateCell = row.getCell(dateCol).value;
    const date = coerceDate(dateCell);
    if (!date) continue;
    const cellValue = String(row.getCell(pilotCol).value ?? '').trim();
    if (!cellValue) continue;
    const season = resolveSeason(opts.seasonOverride ?? null, date);
    const parsed = parseCell(cellValue, season);
    if (parsed) out[isoDate(date)] = parsed;
  }
  return out;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  const lastRow = Math.min(20, sheet.lastRow?.number ?? 20);
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.min(20, row.cellCount); c++) {
      const v = String(row.getCell(c).value ?? '').trim().toLowerCase();
      if (v === 'datum' || v === 'date') return r;
    }
  }
  return null;
}

function findDateColumn(sheet: ExcelJS.Worksheet, headerRow: number): number {
  const row = sheet.getRow(headerRow);
  for (let c = 1; c <= Math.min(20, row.cellCount); c++) {
    const v = String(row.getCell(c).value ?? '').trim().toLowerCase();
    if (v === 'datum' || v === 'date') return c;
  }
  return 1;
}

function findPilotColumn(sheet: ExcelJS.Worksheet, headerRow: number, pilotName: string): number | null {
  const row = sheet.getRow(headerRow);
  const name = pilotName.toLowerCase();
  const tokens = name.split(/\s+/).filter(t => t.length >= 3);
  // Exact match first
  for (let c = 1; c <= row.cellCount; c++) {
    const v = String(row.getCell(c).value ?? '').trim().toLowerCase();
    if (v === name) return c;
  }
  // Token match (last name or first name)
  for (let c = 1; c <= row.cellCount; c++) {
    const v = String(row.getCell(c).value ?? '').trim().toLowerCase();
    if (tokens.some(t => v.includes(t))) return c;
  }
  return null;
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)); // Excel serial
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (v && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
    return coerceDate((v as { result: unknown }).result);
  }
  return null;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseCell(raw: string, season: 'summer' | 'winter'): ParsedScheduleEntry | null {
  const v = raw.toLowerCase();
  // Tokenize on whitespace, commas, semicolons, slashes for robust marker matching.
  const tokens = v.split(/[\s,;/]+/).map(t => t.trim()).filter(Boolean);
  const hasToken = (markers: string[]) => tokens.some(t => markers.includes(t));

  const isAm = hasToken(AM_MARKERS) || AM_MARKERS.some(m => m.includes(' ') && v.includes(m));
  const isPm = hasToken(PM_MARKERS) || PM_MARKERS.some(m => m.includes(' ') && v.includes(m));
  const isFull = !isAm && !isPm && hasToken(FULL_MARKERS);
  if (!isAm && !isPm && !isFull) {
    // Cell present but doesn't match any marker — skip rather than guess.
    return null;
  }
  const exclude7 = NO_07_MARKERS.some(m => v.includes(m));
  const exclude17 = NO_17_MARKERS.some(m => v.includes(m));

  const all = (season === 'summer' ? [...SUMMER_TRIP_TIMES] : [...WINTER_TRIP_TIMES]);
  const half = Math.ceil(all.length / 2);
  let times: string[];
  if (isAm) times = all.slice(0, half);
  else if (isPm) times = all.slice(half);
  else times = all;

  if (season === 'summer') {
    if (exclude7) times = times.filter(t => t !== '07:10');
    if (exclude17) times = times.filter(t => t !== '17:00');
    // If the optional times weren't excluded, leave them — the pilot can still skip them.
    void OPTIONAL_SUMMER_TIMES;
  }

  const period = isAm ? 'half_am' : isPm ? 'half_pm' : 'full';
  return { period, times };
}
