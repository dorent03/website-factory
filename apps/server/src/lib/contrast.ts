/** WCAG 2.x relative luminance and contrast ratio for #rrggbb / rgb() colors. */
export function parseColor(c: string): [number, number, number] | null {
  const s = c.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)) as [number, number, number];
  m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]!].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function lum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const [l1, l2] = [lum(ca), lum(cb)].sort((x, y) => y - x) as [number, number];
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

const PAIRS: Array<[string, string, number, string]> = [
  ['text', 'bg', 4.5, 'body text on background'],
  ['text', 'surface', 4.5, 'body text on surface'],
  ['muted', 'bg', 4.5, 'secondary text on background'],
  ['accent-contrast', 'accent', 4.5, 'button label on accent'],
  ['accent', 'bg', 3, 'accent (links/UI) on background'],
];

/** Checks the semantic token pairs every design system must satisfy. */
export function checkPalette(colors: Array<{ token: string; value: string }>): Array<{ pair: string; ratio: number | null; required: number; pass: boolean }> {
  const get = (t: string) => colors.find((c) => c.token === t || c.token === `--${t}` || c.token === `color-${t}`)?.value;
  return PAIRS.map(([fg, bg, req, label]) => {
    const a = get(fg);
    const b = get(bg);
    const ratio = a && b ? contrast(a, b) : null;
    return { pair: `${label} (${fg}/${bg})`, ratio, required: req, pass: ratio !== null && ratio >= req };
  });
}

const hex = (rgb: [number, number, number]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** Nudges `fg` toward black or white (whichever helps) until it reaches `required` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, required: number): string {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return fg;
  if ((contrast(fg, bg) ?? 0) >= required) return fg;
  const target: [number, number, number] = lum(b) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const mixed = hex([0, 1, 2].map((i) => a[i]! + (target[i]! - a[i]!) * t) as [number, number, number]);
    if ((contrast(mixed, bg) ?? 0) >= required) return mixed;
  }
  return hex(target);
}

/** Applies ensureContrast to the semantic pairs and reports what was changed. */
export function repairPalette(colors: Array<{ token: string; value: string; role: string }>): string[] {
  const changes: string[] = [];
  const get = (t: string) => colors.find((c) => c.token === t);
  const fix = (fgT: string, bgT: string, req: number) => {
    const fg = get(fgT);
    const bg = get(bgT);
    if (!fg || !bg) return;
    const next = ensureContrast(fg.value, bg.value, req);
    if (next.toLowerCase() !== fg.value.toLowerCase()) { changes.push(`${fgT} ${fg.value} → ${next} (contrast on ${bgT} ≥ ${req})`); fg.value = next; }
  };
  fix('text', 'bg', 7); fix('text', 'surface', 4.5); fix('muted', 'bg', 4.5); fix('muted', 'surface', 4.5); fix('accent-contrast', 'accent', 4.5);
  return changes;
}
