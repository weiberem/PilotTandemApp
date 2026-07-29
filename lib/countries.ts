// German country names for the passenger-nationality option (Settings).
// The list is intentionally broad; ranking (below) surfaces the most-used.
export const COUNTRIES: string[] = [
  'Ägypten', 'Albanien', 'Algerien', 'Andorra', 'Argentinien', 'Armenien', 'Aserbaidschan',
  'Australien', 'Bahrain', 'Bangladesch', 'Belgien', 'Bolivien', 'Bosnien und Herzegowina',
  'Brasilien', 'Bulgarien', 'Chile', 'China', 'Costa Rica', 'Dänemark', 'Deutschland',
  'Dominikanische Republik', 'Ecuador', 'Estland', 'Finnland', 'Frankreich', 'Georgien',
  'Ghana', 'Griechenland', 'Grossbritannien', 'Indien', 'Indonesien', 'Irak', 'Iran',
  'Irland', 'Island', 'Israel', 'Italien', 'Japan', 'Jemen', 'Jordanien', 'Kambodscha',
  'Kanada', 'Kasachstan', 'Katar', 'Kenia', 'Kolumbien', 'Kroatien', 'Kuwait', 'Laos',
  'Lettland', 'Libanon', 'Liechtenstein', 'Litauen', 'Luxemburg', 'Malaysia', 'Malta',
  'Marokko', 'Mexiko', 'Moldawien', 'Monaco', 'Mongolei', 'Montenegro', 'Nepal',
  'Neuseeland', 'Niederlande', 'Nigeria', 'Nordmazedonien', 'Norwegen', 'Österreich',
  'Oman', 'Pakistan', 'Panama', 'Peru', 'Philippinen', 'Polen', 'Portugal',
  'Rumänien', 'Russland', 'Saudi-Arabien', 'Schweden', 'Schweiz', 'Serbien', 'Singapur',
  'Slowakei', 'Slowenien', 'Spanien', 'Sri Lanka', 'Südafrika', 'Südkorea', 'Taiwan',
  'Thailand', 'Tschechien', 'Tunesien', 'Türkei', 'Ukraine', 'Ungarn', 'Uruguay', 'USA',
  'Venezuela', 'Vereinigte Arabische Emirate', 'Vietnam', 'Weissrussland', 'Zypern',
];

/** Seeded highest until the pilot's own picks (counts) take over. */
export const DEFAULT_TOP = ['China', 'USA', 'Südkorea', 'Indien'] as const;

function defaultRank(name: string): number {
  const i = (DEFAULT_TOP as readonly string[]).indexOf(name);
  return i < 0 ? DEFAULT_TOP.length : i;
}

function byRank(counts: Record<string, number>) {
  return (a: string, b: string): number => {
    const ca = counts[a] ?? 0, cb = counts[b] ?? 0;
    if (cb !== ca) return cb - ca;                 // most-used first
    const da = defaultRank(a), db = defaultRank(b); // then seeded defaults
    if (da !== db) return da - db;
    return a.localeCompare(b, 'de');                // then alphabetical
  };
}

/**
 * Ranked country suggestions for a query. Prefix matches come first (each
 * group ranked by pick-count → seeded defaults → alphabetical); substring
 * matches follow. Empty query returns the full list ranked.
 */
export function rankCountries(query: string, counts: Record<string, number> = {}): string[] {
  const q = query.trim().toLowerCase();
  const cmp = byRank(counts);
  if (!q) return [...COUNTRIES].sort(cmp);
  const prefix = COUNTRIES.filter(c => c.toLowerCase().startsWith(q)).sort(cmp);
  const contains = q.length >= 2
    ? COUNTRIES.filter(c => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q)).sort(cmp)
    : [];
  return [...prefix, ...contains];
}
