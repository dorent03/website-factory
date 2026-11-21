const MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

/** Generates a filesystem-safe slug. Never trusts user input to be a path. */
export function slugify(input: string, fallback = 'item'): string {
  const s = input
    .replace(/[äöüßÄÖÜ]/g, (c) => MAP[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s.length >= 1 ? s : fallback;
}

export function uniqueSlug(base: string, taken: (s: string) => boolean): string {
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const s = `${base.slice(0, 56)}-${i}`;
    if (!taken(s)) return s;
  }
  throw new Error('could not allocate slug');
}
