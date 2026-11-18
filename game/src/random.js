// Seeded randomness for Solmar Bay. Every random choice in the game flows
// through one of these, so a seed always rebuilds the same city, the same
// traffic and the same mission layout — the deterministic shots depend on it.
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range(min, max) { return min + next() * (max - min); },
    /** An integer in [min, max]. */
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    /** One element of a non-empty array. */
    pick(list) { return list[Math.floor(next() * list.length)]; },
    /** True with probability p (0..1). */
    chance(p) { return next() < p; },
    /** A random angle in radians. */
    angle() { return next() * Math.PI * 2; },
  };
}
