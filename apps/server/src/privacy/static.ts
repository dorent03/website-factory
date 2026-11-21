import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { FormInventory } from '@wf/shared';

export interface StaticRef { origin: string; url: string; kind: string; file: string; gated: boolean }
export interface StaticScan { refs: StaticRef[]; forms: FormInventory[]; storageApis: Array<{ file: string; api: string }>; mailto: boolean; localFonts: string[]; files: string[] }

function walk(dir: string, root = dir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, root, out); else out.push(relative(root, p));
  }
  return out;
}

const originOf = (u: string): string | null => {
  if (!/^(https?:)?\/\//i.test(u.trim())) return null;
  try { return new URL(u.trim().startsWith('//') ? `https:${u.trim()}` : u.trim()).origin; } catch { return null; }
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x !== undefined) ?? null;

/** Source-level scan: every reference to another origin, all forms and storage API usage. */
export function staticScan(siteDir: string): StaticScan {
  const files = walk(siteDir);
  const refs: StaticRef[] = [];
  const forms: FormInventory[] = [];
  const storageApis: Array<{ file: string; api: string }> = [];
  let mailto = false;
  const add = (url: string | null, kind: string, file: string, gated = false) => {
    if (!url) return;
    const o = originOf(url);
    if (o) refs.push({ origin: o, url: url.slice(0, 400), kind, file, gated });
  };
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs', '.svg', '.webmanifest', '.json'].includes(ext)) continue;
    const text = readFileSync(join(siteDir, f), 'utf8');
    if (ext === '.html') {
      if (/href\s*=\s*["']mailto:/i.test(text)) mailto = true;
      for (const m of text.matchAll(/<(iframe|script|link|img|source|video|audio|embed|object|track|form|a)\b[^>]*>/gi)) {
        const tag = m[0];
        const name = m[1]!.toLowerCase();
        if (name === 'a') continue;
        if (name === 'script' && /type\s*=\s*["']text\/plain["']/i.test(tag)) { add(attr(tag, 'data-wf-src'), 'script(gated)', f, true); continue; }
        if (name === 'link') { const rel = (attr(tag, 'rel') ?? '').toLowerCase(); if (/stylesheet|preconnect|dns-prefetch|preload|icon|manifest|modulepreload/.test(rel)) add(attr(tag, 'href'), `link:${rel}`, f); continue; }
        if (name === 'form') continue;
        add(attr(tag, 'src'), name, f);
        add(attr(tag, 'data'), name, f);
        const srcset = attr(tag, 'srcset');
        if (srcset) for (const part of srcset.split(',')) add(part.trim().split(/\s+/)[0] ?? null, `${name}:srcset`, f);
      }
      for (const m of text.matchAll(/data-wf-src\s*=\s*["']([^"']+)["']/gi)) add(m[1]!, 'embed(gated)', f, true);
      for (const m of text.matchAll(/style\s*=\s*["'][^"']*url\(\s*["']?([^"')]+)/gi)) add(m[1]!, 'inline-style', f);
      for (const m of text.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
        const open = `<form${m[1]}>`;
        const body = m[2]!;
        const fields: FormInventory['fields'] = [];
        for (const im of body.matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
          const t = im[0];
          const type = (attr(t, 'type') ?? im[1]!.toLowerCase()).toLowerCase();
          if (['submit', 'button', 'reset', 'image'].includes(type)) continue;
          const nm = attr(t, 'name') ?? '';
          const idv = attr(t, 'id');
          const label = idv ? body.match(new RegExp(`<label[^>]*for=["']${idv}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i'))?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '' : '';
          fields.push({ name: nm, type, required: /\brequired\b/i.test(t), label: label || (attr(t, 'aria-label') ?? '') });
        }
        const action = attr(open, 'action') ?? '';
        forms.push({
          page: f, action, method: (attr(open, 'method') ?? 'get').toLowerCase(), target: originOf(action) ?? (action ? 'same-origin' : 'none'),
          fields, hasPrivacyNotice: /datenschutz/i.test(body), hasHoneypot: fields.some((x) => x.name === 'website' && (x.type === 'text' || x.type === 'url')),
        });
        add(action, 'form-action', f);
      }
    }
    if (ext === '.css') {
      for (const m of text.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) add(m[1]!, 'css-import', f);
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)/gi)) add(m[1]!, 'css-url', f);
    }
    if (ext === '.js' || ext === '.mjs') {
      if (!f.startsWith('assets/wf/')) for (const m of text.matchAll(/\b(localStorage|sessionStorage|document\.cookie|indexedDB)\b/g)) storageApis.push({ file: f, api: m[1]! });
      for (const m of text.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/g)) add(m[1]!, 'js-url', f);
    }
  }
  const localFonts = files.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
  const dedup = new Map<string, StaticRef>();
  for (const r of refs) dedup.set(`${r.origin}|${r.kind}|${r.file}`, r);
  return { refs: [...dedup.values()], forms, storageApis: [...new Map(storageApis.map((s) => [`${s.file}|${s.api}`, s])).values()], mailto, localFonts, files };
}
