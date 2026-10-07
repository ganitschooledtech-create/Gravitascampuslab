/** Deterministic shuffle (seeded) so a learner sees a stable order between reloads. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Make sure a shuffled list is not accidentally in the correct order. */
export function shuffleAwayFrom<T extends { id: string }>(items: T[], correct: string[], seed: string): T[] {
  let s = seededShuffle(items, seed);
  for (let k = 1; k < 6 && s.map((x) => x.id).join() === correct.join() && items.length > 1; k++) s = seededShuffle(items, seed + k);
  if (s.map((x) => x.id).join() === correct.join() && s.length > 1) s = [...s.slice(1), s[0]];
  return s;
}
