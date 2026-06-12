import { describe, it, expect } from 'vitest';
import { detectMonthFromName } from './einsatzplanImports';

describe('detectMonthFromName', () => {
  it('reads German month names with a year', () => {
    expect(detectMonthFromName('Einsatzplan Juli 2026.xlsx')).toBe('2026-07');
    expect(detectMonthFromName('Plan März 2026.xlsx')).toBe('2026-03');
    expect(detectMonthFromName('einsatzplan_dezember_2025.xls')).toBe('2025-12');
  });

  it('reads numeric forms', () => {
    expect(detectMonthFromName('Plan_2026-07.xlsx')).toBe('2026-07');
    expect(detectMonthFromName('07.2026 Einsatzplan.xlsx')).toBe('2026-07');
    expect(detectMonthFromName('2026_11 plan.xlsx')).toBe('2026-11');
  });

  it('returns null when ambiguous', () => {
    expect(detectMonthFromName('Einsatzplan.xlsx')).toBeNull();
    expect(detectMonthFromName('Juli.xlsx')).toBeNull();        // no year
    expect(detectMonthFromName(null)).toBeNull();
  });

  it('does not fire on substrings', () => {
    expect(detectMonthFromName('Marathon 2026.xlsx')).toBeNull();
  });
});
