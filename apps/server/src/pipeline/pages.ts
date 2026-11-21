import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Lists the HTML pages of a static site with their <title>. */
export function listPages(root: string): Array<{ path: string; title: string }> {
  if (!existsSync(root)) return [];
  const out: Array<{ path: string; title: string }> = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (name.endsWith('.html')) {
        const html = readFileSync(p, 'utf8');
        const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? name;
        out.push({ path: relative(root, p), title });
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => (a.path === 'index.html' ? -1 : b.path === 'index.html' ? 1 : a.path.localeCompare(b.path)));
}
