import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Curated, self-hostable fonts (SIL OFL 1.1). Generated sites never load fonts from a third-party server. */
export const FONT_CATALOG = [
  { pkg: '@fontsource-variable/manrope', family: 'Manrope', category: 'sans', character: 'geometric-humanist, friendly, modern' },
  { pkg: '@fontsource-variable/figtree', family: 'Figtree', category: 'sans', character: 'clean geometric, approachable' },
  { pkg: '@fontsource-variable/dm-sans', family: 'DM Sans', category: 'sans', character: 'low-contrast geometric, crisp' },
  { pkg: '@fontsource-variable/instrument-sans', family: 'Instrument Sans', category: 'sans', character: 'precise grotesque, editorial-technical' },
  { pkg: '@fontsource-variable/public-sans', family: 'Public Sans', category: 'sans', character: 'neutral, institutional, very legible' },
  { pkg: '@fontsource-variable/work-sans', family: 'Work Sans', category: 'sans', character: 'grotesque, sturdy, slightly wide' },
  { pkg: '@fontsource-variable/onest', family: 'Onest', category: 'sans', character: 'contemporary grotesque, calm' },
  { pkg: '@fontsource-variable/archivo', family: 'Archivo', category: 'sans', character: 'industrial grotesque, strong headlines, technical' },
  { pkg: '@fontsource-variable/space-grotesk', family: 'Space Grotesk', category: 'display', character: 'technical, quirky, engineering' },
  { pkg: '@fontsource-variable/bricolage-grotesque', family: 'Bricolage Grotesque', category: 'display', character: 'characterful, warm, expressive display' },
  { pkg: '@fontsource-variable/outfit', family: 'Outfit', category: 'display', character: 'round geometric display' },
  { pkg: '@fontsource-variable/fraunces', family: 'Fraunces', category: 'serif', character: 'soft old-style display serif, warm, crafted' },
  { pkg: '@fontsource-variable/newsreader', family: 'Newsreader', category: 'serif', character: 'editorial text serif' },
  { pkg: '@fontsource-variable/source-serif-4', family: 'Source Serif 4', category: 'serif', character: 'classic text serif, trustworthy' },
  { pkg: '@fontsource-variable/literata', family: 'Literata', category: 'serif', character: 'bookish, calm serif' },
  { pkg: '@fontsource/ibm-plex-sans', family: 'IBM Plex Sans', category: 'sans', character: 'engineered, corporate-technical' },
] as const;

export function fontCatalogForPrompt(): string {
  return FONT_CATALOG.map((f) => `- "${f.family}" (fontsourcePackage "${f.pkg}", ${f.category}): ${f.character}`).join('\n');
}

export interface InstalledFont { family: string; cssFamily: string; files: string[]; css: string; license: string; attribution: string; pkg: string }

/**
 * Copies latin + latin-ext woff2 subsets (umlauts and ß are in latin) of a catalog font into `destDir`
 * and returns matching @font-face rules. Unknown packages are refused.
 */
export function installFont(pkg: string, destDir: string, urlPrefix: string): InstalledFont {
  const entry = FONT_CATALOG.find((f) => f.pkg === pkg);
  if (!entry) throw new Error(`font package not in catalog: ${pkg}`);
  const root = dirname(require.resolve(`${pkg}/package.json`));
  const meta = JSON.parse(readFileSync(join(root, 'metadata.json'), 'utf8'));
  const unicode = JSON.parse(readFileSync(join(root, 'unicode.json'), 'utf8')) as Record<string, string>;
  const id = meta.id as string;
  const variable = pkg.startsWith('@fontsource-variable/');
  const cssFamily = entry.family;
  mkdirSync(destDir, { recursive: true });
  const files: string[] = [];
  const rules: string[] = [];
  const styles: string[] = meta.styles ?? ['normal'];
  const variants = variable ? styles.map((s) => ({ style: s, weight: `${meta.variable.wght.min} ${meta.variable.wght.max}`, tag: `wght-${s}` })) : [400, 500, 600, 700].filter((w) => meta.weights.includes(w)).map((w) => ({ style: 'normal', weight: String(w), tag: `${w}-normal` }));
  for (const sub of ['latin-ext', 'latin']) {
    for (const v of variants) {
      const name = `${id}-${sub}-${v.tag}.woff2`;
      const src = join(root, 'files', name);
      if (!existsSync(src)) continue;
      copyFileSync(src, join(destDir, name));
      files.push(name);
      rules.push(`@font-face {\n  font-family: '${cssFamily}';\n  font-style: ${v.style};\n  font-display: swap;\n  font-weight: ${v.weight};\n  src: url('${urlPrefix}${name}') format('woff2');\n  unicode-range: ${unicode[sub]};\n}`);
    }
  }
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  writeFileSync(join(destDir, 'LICENSE.txt'), license);
  return { family: entry.family, cssFamily, files, css: rules.join('\n\n'), license: meta.license?.type ?? 'OFL-1.1', attribution: meta.license?.attribution ?? '', pkg };
}
