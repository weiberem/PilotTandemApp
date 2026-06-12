import { describe, it, expect } from 'vitest';
import {
  addMonths, monthFirst, monthGrid, monthLabel, nextDeadlineInfo,
  buildMailto, dayMailtoLine, buildChangeRequestEmail, formatChangeRequestDate,
  buildSwapMatchEmail, summarizeChangeRequests,
  type AvailabilityDay, type ChangeRequestMap,
} from './availability';

describe('monthFirst', () => {
  it('zero-pads month', () => {
    expect(monthFirst(2025, 0)).toBe('2025-01-01');
    expect(monthFirst(2025, 11)).toBe('2025-12-01');
  });
});

describe('addMonths', () => {
  it('rolls over year', () => {
    expect(addMonths(2025, 11, 1)).toEqual({ year: 2026, monthIndex0: 0 });
    expect(addMonths(2025, 0, -1)).toEqual({ year: 2024, monthIndex0: 11 });
  });
});

describe('monthGrid', () => {
  it('produces a Monday-first grid covering Jan 2025 (Wed start, Fri end → 5 weeks)', () => {
    const g = monthGrid(2025, 0);
    expect(g.length % 7).toBe(0);
    // Find first in-month cell — should be Jan 1.
    const firstInMonth = g.findIndex(c => c.inMonth);
    expect(g[firstInMonth].date).toBe('2025-01-01');
    // The 3 cells before should be Dec 29, 30, 31 (Mon, Tue, Wed before).
    expect(g[firstInMonth - 1].date).toBe('2024-12-31');
    // Last in-month cell is Jan 31.
    const lastInMonth = [...g].reverse().findIndex(c => c.inMonth);
    expect(g[g.length - 1 - lastInMonth].date).toBe('2025-01-31');
  });
});

describe('monthLabel', () => {
  it('formats in German', () => {
    const label = monthLabel(2025, 0);
    expect(label.toLowerCase()).toContain('januar');
    expect(label).toContain('2025');
  });
});

describe('dayMailtoLine', () => {
  it('formats day with period only', () => {
    const day: AvailabilityDay = { date: '2025-01-15', period: 'full' };
    expect(dayMailtoLine(day)).toBe('15.01. Ganztag');
  });
  it('appends exclusions', () => {
    expect(dayMailtoLine({ date: '2025-06-05', period: 'full', exclude_7am: true }))
      .toBe('05.06. Ganztag (kein 07:10)');
    expect(dayMailtoLine({ date: '2025-06-05', period: 'full', exclude_5pm: true }))
      .toBe('05.06. Ganztag (kein 17:00)');
    expect(dayMailtoLine({ date: '2025-06-05', period: 'half_am', exclude_7am: true, exclude_5pm: true }))
      .toBe('05.06. Halbtag Vormittag (kein 07:10, kein 17:00)');
  });
});

describe('buildMailto', () => {
  it('produces mailto with subject, body, and to', () => {
    const url = buildMailto({
      to: 'office@example.ch',
      pilotName: 'Rémy Weibel',
      year: 2025,
      monthIndex0: 0,
      days: [
        { date: '2025-01-15', period: 'full' },
        { date: '2025-01-01', period: 'half_am' },
      ],
    });
    expect(url.startsWith('mailto:')).toBe(true);
    expect(url).toContain('office%40example.ch');
    expect(url).toContain('subject=');
    expect(url).toContain('body=');
    expect(url).not.toContain('+');           // spaces encoded as %20
    // Days sorted ascending in body
    const body = decodeURIComponent(url.split('body=')[1]);
    expect(body.indexOf('01.01.')).toBeLessThan(body.indexOf('15.01.'));
  });
});

describe('nextDeadlineInfo', () => {
  it('on 29 May → submit by 15 Juni for Juli', () => {
    const info = nextDeadlineInfo(new Date(2026, 4, 29)); // month 4 = May
    expect(info.deadlineMonthLabel.toLowerCase()).toContain('juni');
    expect(info.targetMonthLabel.toLowerCase()).toContain('juli');
    expect(info.targetMonth).toBe('2026-07-01');
  });

  it('on 10 May (before 15th) → submit by 15 Mai for Juni', () => {
    const info = nextDeadlineInfo(new Date(2026, 4, 10));
    expect(info.deadlineMonthLabel.toLowerCase()).toContain('mai');
    expect(info.targetMonthLabel.toLowerCase()).toContain('juni');
    expect(info.targetMonth).toBe('2026-06-01');
  });

  it('rolls over the year: 20 Dec → 15 Jan for Feb', () => {
    const info = nextDeadlineInfo(new Date(2026, 11, 20)); // Dec
    expect(info.deadlineMonthLabel.toLowerCase()).toContain('januar');
    expect(info.targetMonth).toBe('2027-02-01');
  });

  it('flags urgent within 5 days of the deadline', () => {
    expect(nextDeadlineInfo(new Date(2026, 4, 12)).urgent).toBe(true);  // 3 days before 15 May
    expect(nextDeadlineInfo(new Date(2026, 4, 2)).urgent).toBe(false);  // 13 days before
  });

  it('reports whole days left until the 15th', () => {
    expect(nextDeadlineInfo(new Date(2026, 4, 12)).daysLeft).toBe(3);
    expect(nextDeadlineInfo(new Date(2026, 4, 10)).daysLeft).toBe(5);
  });
});

describe('formatChangeRequestDate', () => {
  it('formats YYYY-MM-DD as DD.MM.YYYY', () => {
    expect(formatChangeRequestDate('2026-07-18')).toBe('18.07.2026');
  });
});

describe('buildChangeRequestEmail', () => {
  it('builds a German subject and body with the reason', () => {
    const { subject, text } = buildChangeRequestEmail({
      pilotName: 'Rémy Weibel', date: '2026-07-18', reason: 'sick',
    });
    expect(subject).toBe('Änderungswunsch 18.07.2026 — Rémy Weibel');
    expect(text).toContain('Grund: Krankheit');
    expect(text).toContain('Datum: 18.07.2026');
    expect(text).not.toContain('Notiz:');
  });

  it('includes a trimmed note when present, omits when blank', () => {
    expect(buildChangeRequestEmail({
      pilotName: 'X', date: '2026-07-18', reason: 'swap', note: '  tausche mit Flo  ',
    }).text).toContain('Notiz: tausche mit Flo');
    expect(buildChangeRequestEmail({
      pilotName: 'X', date: '2026-07-18', reason: 'swap', note: '   ',
    }).text).not.toContain('Notiz:');
  });
});

describe('buildSwapMatchEmail', () => {
  it('names both pilots and the day', () => {
    const { subject, text } = buildSwapMatchEmail({
      requester: 'Rémy', accepter: 'Flo', date: '2026-07-18',
    });
    expect(subject).toBe('Tausch bestätigt 18.07.2026 — Rémy ↔ Flo');
    expect(text).toContain('Pilot 1: Rémy');
    expect(text).toContain('Pilot 2: Flo');
    expect(text).toContain('18.07.2026');
  });
});

describe('summarizeChangeRequests', () => {
  it('counts totals and pending', () => {
    const map: ChangeRequestMap = {
      '2026-07-01': { reason: 'sick', status: 'pending', created_at: 'x' },
      '2026-07-08': { reason: 'swap', status: 'matched', created_at: 'x' },
      '2026-07-09': { reason: 'other', status: 'resolved', created_at: 'x' },
    };
    expect(summarizeChangeRequests(map)).toEqual({ total: 3, pending: 1 });
    expect(summarizeChangeRequests(undefined)).toEqual({ total: 0, pending: 0 });
  });
});
