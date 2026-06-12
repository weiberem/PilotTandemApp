/**
 * Derive the trip times of CC photo flights from SumUp card payments.
 *
 * Passengers pay for photos by card AFTER the flight — typically ~1 hour later.
 * So a 40-CHF payment at 12:50 belongs to the 11:45 trip. In the early morning
 * the gap is tighter: an 08:15 payment can still be the 07:10 flight even though
 * 08:10 is also a trip time (5 min is too soon to be 08:10's photo).
 *
 * For each payment we pick the candidate trip time `t <= payment` whose lag
 * (payment - t) lands in a plausible window and is closest to the typical lag.
 * Each trip can only be matched once (one tandem passenger ⇒ one photo).
 */

const IDEAL_LAG = 65;   // minutes: typical photo-payment delay
const MIN_LAG = 35;     // shorter than this and it's too soon to be that flight
const MAX_LAG = 140;    // longer than this and it's probably a later flight

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export type CcMatch = { payment: string; trip: string | null };

/**
 * Map each payment time (HH:MM) to a trip time (HH:MM) from `candidateTimes`.
 * Payments are processed earliest-first; a matched trip is consumed so two
 * payments never collapse onto the same trip. `trip` is null when nothing fits.
 */
export function deriveCcTripTimes(paymentTimes: string[], candidateTimes: string[]): CcMatch[] {
  const cands = [...new Set(candidateTimes)].sort();
  const used = new Set<string>();

  return [...paymentTimes].sort().map(payment => {
    const p = toMin(payment);
    let best: string | null = null;
    let bestScore = Infinity;

    // Preferred: a trip whose lag is within the plausible window.
    for (const t of cands) {
      if (used.has(t)) continue;
      const lag = p - toMin(t);
      if (lag < MIN_LAG || lag > MAX_LAG) continue;
      const score = Math.abs(lag - IDEAL_LAG);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    // Fallback: the nearest earlier trip, if none landed in the window.
    if (!best) {
      let bestLag = Infinity;
      for (const t of cands) {
        if (used.has(t)) continue;
        const lag = p - toMin(t);
        if (lag > 0 && lag < bestLag) { bestLag = lag; best = t; }
      }
    }
    if (best) used.add(best);
    return { payment, trip: best };
  });
}
