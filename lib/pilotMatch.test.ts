import { describe, it, expect } from 'vitest';
import { namesMatch } from './pilotMatch';

describe('namesMatch', () => {
  it('matches reordered first/last names', () => {
    expect(namesMatch('Weibel Rémy', 'Rémy Weibel')).toBe(true);
    expect(namesMatch('Rémy Weibel', 'Weibel Rémy')).toBe(true);
  });

  it('matches exact and substring forms', () => {
    expect(namesMatch('Flo', 'Flo')).toBe(true);
    expect(namesMatch('Flo', 'Florian Meier')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(namesMatch('Weibel Rémy', 'Hans Müller')).toBe(false);
  });

  it('is safe with empty input', () => {
    expect(namesMatch('', 'Rémy Weibel')).toBe(false);
    expect(namesMatch('Rémy', '')).toBe(false);
  });
});
