/**
 * Fuzzy match between an Einsatzplan roster name (e.g. "Weibel Rémy") and a
 * pilot account's full_name (e.g. "Rémy Weibel"). Deliberately lenient —
 * rosters abbreviate and reorder names — but only used to *propose* a match;
 * swap requests resolve to an exact account id and require a unique hit.
 */
export function namesMatch(rosterName: string, accountName: string): boolean {
  if (!rosterName || !accountName) return false;
  const r = rosterName.toLowerCase().trim();
  const a = accountName.toLowerCase().trim();
  if (r === a || a.includes(r) || r.includes(a)) return true;
  // Token overlap: every token of the shorter name appears in the longer one.
  const rt = r.split(/\s+/).filter(Boolean);
  const at = a.split(/\s+/).filter(Boolean);
  if (rt.length === 0 || at.length === 0) return false;
  const [short, long] = rt.length <= at.length ? [rt, at] : [at, rt];
  return short.every(tok => long.some(l => l === tok));
}
