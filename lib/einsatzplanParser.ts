import ExcelJS from 'exceljs';
import {
  SUMMER_TRIP_TIMES, WINTER_TRIP_TIMES, resolveSeason,
} from './tripTimes';

/**
 * Skywings Einsatzplan parser — MATRIX format.
 *
 * The real Skywings plan (verified against Einsatzplan_Juni_2026.xlsx) is a
 * wide matrix, NOT a date list:
 *
 *   Row "JUNI" weekdays:  | Mo Mo | Di Di | Mi Mi | ...   (each day = 2 cols)
 *   Row "JUNI" day nums:  | 1   1 | 2   2 | 3   3 | ...   (day d in even col 2d)
 *   Col A = pilot names (one row per pilot)
 *   Each pilot row, per day, has TWO shift cells:
 *       1   = available/scheduled, full
 *       0.5 = half
 *       ""  = not working that shift
 *   shift1 (left col) ≈ morning, shift2 (right col) ≈ afternoon.
 *
 * The sheet name encodes the month + year (e.g. "June_2026").
 *
 * We map each day to:
 *   both shifts present  → period 'full'      → all season trip times
 *   only shift1 present  → period 'half_am'   → first half of season times
 *   only shift2 present  → period 'half_pm'   → second half of season times
 *   neither present      → skipped (not scheduled)
 *
 * Per-day exception text ("No 7:10" / "No 17:00") found in either shift cell
 * removes the corresponding optional summer slot.
 *
 * Output is keyed by ISO date so the /log smart pre-fill can use the exact
 * scheduled trip times for that day.
 */

export type ParsedScheduleEntry = {
  period: 'full' | 'half_am' | 'half_pm';
  times: string[];
};
export type ParsedSchedule = Record<string, ParsedScheduleEntry>;

export type ParseOptions = {
  pilotName: string;
  seasonOverride?: 'summer' | 'winter' | null;
  columnMapping?: {
    sheetName?: string;
    dayHeaderRow?: number;   // 1-based; row that holds day-of-month numbers
    pilotRow?: number;       // 1-based; the pilot's row
  };
};

/**
 * Read the pilot's general monthly exceptions and return the set of HOURS to
 * exclude from every scheduled day. Skywings writes notes like
 * "No 7:10 No 17:00" or "No 7:10, 16:00, 17:00" in a cell at the end of the
 * pilot's row. We scan the whole row for any cell that mentions "no <time>"
 * and collect the hours (7 → 07:xx, 16 → 16:xx, 17 → 17:xx, …).
 */
function collectExcludedHours(ws: ExcelJS.Worksheet, pilotRow: number): Set<number> {
  const hours = new Set<number>();
  const lastCol = Math.max(ws.columnCount, 70);
  for (let c = 2; c <= lastCol; c++) {
    const v = cellValue(ws, pilotRow, c);
    if (typeof v !== 'string') continue;
    const text = v.toLowerCase();
    if (!/\bno\b|kein/.test(text)) continue;
    // Every number in such a note is an excluded time (hour part).
    const matches = text.matchAll(/\b(\d{1,2})(?::?\d{2})?\b/g);
    for (const m of matches) {
      const h = Number(m[1]);
      if (h >= 5 && h <= 20) hours.add(h);
    }
  }
  return hours;
}

const MONTHS: Record<string, number> = {
  // English
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
  // German
  januar: 1, februar: 2, märz: 3, maerz: 3, mai: 5, juni: 6, juli: 7,
  oktober: 10, dezember: 12,
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function cellValue(ws: ExcelJS.Worksheet, r: number, c: number): unknown {
  let v: unknown = ws.getRow(r).getCell(c).value;
  if (v && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
    v = (v as { result: unknown }).result;
  }
  if (v && typeof v === 'object' && 'richText' in (v as Record<string, unknown>)) {
    v = (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
  }
  return v;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  return null;
}

/** "June_2026" / "Juni 2026" / "06_2026" → { month, year } */
function parseSheetMonth(name: string): { month: number; year: number } | null {
  const yearM = name.match(/(20\d{2})/);
  const year = yearM ? Number(yearM[1]) : new Date().getFullYear();
  const lower = normalize(name);
  for (const [key, m] of Object.entries(MONTHS)) {
    if (lower.includes(key)) return { month: m, year };
  }
  const numM = name.match(/\b(0?[1-9]|1[0-2])[_\-./ ]+20\d{2}\b/);
  if (numM) return { month: Number(numM[1]), year };
  return null;
}

/**
 * Find the day-number header row: the row where consecutive days 1,2,3 appear
 * in even columns 2,4,6 (the Skywings grid). Returns row index or null.
 */
function findDayHeaderRow(ws: ExcelJS.Worksheet): number | null {
  const maxScan = Math.min(30, ws.rowCount);
  for (let r = 1; r <= maxScan; r++) {
    // Day 1 in col B and day 2 in col D is a strong, unambiguous signal
    // (week-number rows start at 23+, so they never look like 1,2).
    if (asNumber(cellValue(ws, r, 2)) === 1 &&
        asNumber(cellValue(ws, r, 4)) === 2) {
      return r;
    }
  }
  return null;
}

/** Map day-of-month → first (left) column, reading the header row's even columns. */
function buildDayColumns(ws: ExcelJS.Worksheet, headerRow: number): Map<number, number> {
  const map = new Map<number, number>();
  for (let c = 2; c <= 70; c += 2) {
    const d = asNumber(cellValue(ws, headerRow, c));
    if (d !== null && Number.isInteger(d) && d >= 1 && d <= 31) {
      map.set(d, c);
    }
  }
  return map;
}

/** Find the pilot's row by accent-insensitive name match in column A. */
function findPilotRow(ws: ExcelJS.Worksheet, pilotName: string): number | null {
  const target = normalize(pilotName);
  const tokens = target.split(/\s+/).filter(t => t.length >= 3);
  // Exact full-name match first
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = cellValue(ws, r, 1);
    if (typeof a === 'string' && normalize(a) === target) return r;
  }
  // Token match (first or last name)
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = cellValue(ws, r, 1);
    if (typeof a === 'string') {
      const na = normalize(a);
      if (tokens.some(t => na === t || na.split(/\s+/).includes(t))) return r;
    }
  }
  return null;
}

export async function parseEinsatzplan(
  buffer: ArrayBuffer | Buffer,
  opts: ParseOptions,
): Promise<ParsedSchedule> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const ws = opts.columnMapping?.sheetName
    ? wb.getWorksheet(opts.columnMapping.sheetName)
    : (wb.worksheets.find(s => s.state !== 'hidden') ?? wb.worksheets[0]);
  if (!ws) throw new Error('No worksheet found in Einsatzplan');

  const monthInfo = parseSheetMonth(ws.name);
  if (!monthInfo) {
    throw new Error(`Could not determine month/year from sheet name "${ws.name}". Expected something like "June_2026".`);
  }
  const { month, year } = monthInfo;

  const headerRow = opts.columnMapping?.dayHeaderRow ?? findDayHeaderRow(ws);
  if (!headerRow) {
    throw new Error('Could not locate the day-number header row (expected days 1,2,3… in columns B,D,F).');
  }

  const pilotRow = opts.columnMapping?.pilotRow ?? findPilotRow(ws, opts.pilotName);
  if (!pilotRow) {
    throw new Error(`Could not find a row for pilot "${opts.pilotName}". Check the spelling or set pilotRow in Settings.`);
  }

  const dayCols = buildDayColumns(ws, headerRow);
  const season = resolveSeason(opts.seasonOverride ?? null, new Date(Date.UTC(year, month - 1, 1)));
  const seasonTimes = (season === 'summer' ? [...SUMMER_TRIP_TIMES] : [...WINTER_TRIP_TIMES]);
  const half = Math.ceil(seasonTimes.length / 2);

  // A shift cell counts as "scheduled" if it holds a positive number (1 / 0.5).
  const isPresent = (v: unknown): boolean => {
    const n = asNumber(v);
    return n !== null && n > 0;
  };

  // General monthly exceptions: Skywings writes notes like "No 7:10 No 17:00"
  // or "No 7:10, 16:00, 17:00" in a notes cell at the END of the pilot's row.
  // These apply to EVERY scheduled day, so collect the excluded hours once.
  const excludedHours = collectExcludedHours(ws, pilotRow);

  const applyExclusions = (times: string[]): string[] =>
    excludedHours.size === 0
      ? times
      : times.filter(t => !excludedHours.has(Number(t.slice(0, 2))));

  const out: ParsedSchedule = {};
  for (const [day, col] of dayCols.entries()) {
    const v1 = cellValue(ws, pilotRow, col);
    const v2 = cellValue(ws, pilotRow, col + 1);
    const has1 = isPresent(v1);
    const has2 = isPresent(v2);
    if (!has1 && !has2) continue; // not scheduled

    let period: ParsedScheduleEntry['period'];
    let times: string[];
    if (has1 && has2) { period = 'full'; times = [...seasonTimes]; }
    else if (has1) { period = 'half_am'; times = seasonTimes.slice(0, half); }
    else { period = 'half_pm'; times = seasonTimes.slice(half); }

    times = applyExclusions(times);

    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out[iso] = { period, times };
  }

  if (Object.keys(out).length === 0) {
    throw new Error(`Found pilot "${opts.pilotName}" (row ${pilotRow}) but no scheduled days. Plan may be empty for this month.`);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Full-plan parser: who is scheduled, on which day, in which half.
// ---------------------------------------------------------------------------

export type FullPlanPilot = {
  name: string;                        // as written in the sheet, trimmed
  period: 'full' | 'half_am' | 'half_pm';
  number: number;                      // 1-based row order in the Skywings roster
                                       // = priority order (1 = first to be booked)
};
export type FullPlanDay = {
  date: string;                        // YYYY-MM-DD
  pilots: FullPlanPilot[];
};
export type FullPlan = {
  month: string;                       // YYYY-MM-01
  days: Record<string, FullPlanDay>;   // keyed by date
};

/**
 * Skip-list: rows in column A that aren't pilots (headers, week numbers,
 * empty separators, totals).
 */
const NON_PILOT_NAMES = new Set([
  'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember',
  'januar', 'februar', 'maerz', 'märz', 'april', 'mai',
  'woche', 'week', 'total', 'totals', 'name', 'pilot', 'pilots', 'piloten',
  'goal capacity', 'scheduled', 'yearly plan', 'sign outs',
]);

function looksLikePilotName(s: string): boolean {
  const t = normalize(s);
  if (!t) return false;
  if (NON_PILOT_NAMES.has(t)) return false;
  // pure numbers (week numbers) or punctuation rows
  if (/^[\d\s\-./]+$/.test(t)) return false;
  // single letters or noise
  if (t.length < 2) return false;
  return true;
}

/**
 * Parse the WHOLE Skywings plan: returns every scheduled day with the list of
 * pilots (and their half) for that day. Sheet name still encodes the month.
 *
 * Heuristic for "is this row a pilot?": column A is a non-empty string that
 * doesn't match the known header/footer/week labels, and the row contains at
 * least one positive numeric shift cell in the day grid.
 */
export async function parseFullPlan(
  buffer: ArrayBuffer | Buffer,
  columnMapping?: { sheetName?: string; dayHeaderRow?: number },
): Promise<FullPlan> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const ws = columnMapping?.sheetName
    ? wb.getWorksheet(columnMapping.sheetName)
    : (wb.worksheets.find(s => s.state !== 'hidden') ?? wb.worksheets[0]);
  if (!ws) throw new Error('No worksheet found in Einsatzplan');

  const monthInfo = parseSheetMonth(ws.name);
  if (!monthInfo) {
    throw new Error(`Could not determine month/year from sheet name "${ws.name}".`);
  }
  const { month, year } = monthInfo;
  const monthFirst = `${year}-${String(month).padStart(2, '0')}-01`;

  const headerRow = columnMapping?.dayHeaderRow ?? findDayHeaderRow(ws);
  if (!headerRow) {
    throw new Error('Could not locate the day-number header row.');
  }
  const dayCols = buildDayColumns(ws, headerRow);

  const isPresent = (v: unknown): boolean => {
    const n = asNumber(v);
    return n !== null && n > 0;
  };

  const days: Record<string, FullPlanDay> = {};
  for (const [day] of dayCols.entries()) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = { date: iso, pilots: [] };
  }

  // The Skywings roster is implicitly numbered by row order — first pilot row
  // = Nummer 1, etc. Pilots are booked in this order when there aren't enough
  // customers, so we preserve it for the UI to surface and to split into 7er-
  // Bus-Gruppen.
  const lastRow = ws.lastRow?.number ?? headerRow;
  let nextNumber = 1;
  const numberOf = new Map<string, number>();
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const nameCell = cellValue(ws, r, 1);
    if (typeof nameCell !== 'string') continue;
    const name = nameCell.trim();
    if (!looksLikePilotName(name)) continue;

    if (!numberOf.has(name)) numberOf.set(name, nextNumber++);
    const number = numberOf.get(name)!;

    for (const [day, col] of dayCols.entries()) {
      const v1 = cellValue(ws, r, col);
      const v2 = cellValue(ws, r, col + 1);
      const has1 = isPresent(v1);
      const has2 = isPresent(v2);
      if (!has1 && !has2) continue;
      const period: FullPlanPilot['period'] =
        has1 && has2 ? 'full' : has1 ? 'half_am' : 'half_pm';
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days[iso].pilots.push({ name, period, number });
    }
  }

  // Sort each day's pilot list by Skywings roster number (priority order).
  for (const d of Object.values(days)) {
    d.pilots.sort((a, b) => a.number - b.number);
  }

  return { month: monthFirst, days };
}

