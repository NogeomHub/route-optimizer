/** Exact port of the frozen Python budget study (6a8bcd1), not tuned to new results.
 * Only OBSERVED response sets are accepted. Midpoints use archived grid indices.
 */
import { PocError } from './util.mjs';
export const PENALTIES = [0, 300, 900, 1800];
export const LEVELS = [...Array.from({ length: 21 }, (_, i) => i / 40), .6, .7, .8, .9, 1];
export const PROFILES = PENALTIES.flatMap(p => LEVELS.map(u => ({ use_tolls: u, toll_booth_penalty: p, use_highways: .5, toll_booth_cost: 15 })));
PROFILES.push({ use_tolls: .5, toll_booth_penalty: 0, use_highways: .5, toll_booth_cost: 15, exclude_tolls: true });
export const SEEDS = [104, ...PENALTIES.flatMap((_, p) => [p * 26, p * 26 + 25])];
const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

export function nextProfile(history, { maxProfiles = 40, patience = 8 } = {}) {
  if (maxProfiles > 40 || maxProfiles < 1) throw new PocError('INVALID_BUDGET', 'Plafond autorisé : 1 à 40.', 400);
  const observed = new Map(history.map(x => [x.profile, new Set(x.routes)]));
  if (observed.size !== history.length) throw new Error('Duplicate profile in checkpoint');
  let stale = 0; const seen = new Set();
  for (const row of history) {
    const novel = row.routes.some(x => !seen.has(x));
    row.routes.forEach(x => seen.add(x)); stale = novel ? 0 : stale + 1;
  }
  if (history.length >= maxProfiles) return null;
  if (history.length < 9) return { index: SEEDS[history.length], reason: 'seed' };
  if (history.length >= 12 && stale >= patience) return null;
  const intervals = [];
  for (let p = 0; p < 4; p++) {
    const sampled = LEVELS.map((_, i) => i).filter(i => observed.has(p * 26 + i));
    for (let j = 1; j < sampled.length; j++) {
      const lo = sampled[j - 1], hi = sampled[j];
      if (hi - lo <= 1) continue;
      const differs = !same(observed.get(p * 26 + lo), observed.get(p * 26 + hi));
      intervals.push({ index: p * 26 + Math.floor((lo + hi) / 2), differs, width: LEVELS[hi] - LEVELS[lo], p, lo,
        reason: `midpoint penalty=${PENALTIES[p]}, u=[${LEVELS[lo]},${LEVELS[hi]}], endpoints_differ=${differs}` });
    }
  }
  intervals.sort((a, b) => Number(b.differs) - Number(a.differs) || b.width - a.width || a.p - b.p || a.lo - b.lo);
  return intervals[0] ?? null;
}
