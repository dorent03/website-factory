import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QAFinding, QASection } from '@wf/shared';
import type { CrawledPage } from './crawl.ts';
import { f, section } from './section.ts';

const attr = (html: string, re: RegExp) => html.match(re)?.[1]?.trim() ?? '';

/** Technical SEO from the source files plus the rendered crawl. */
export function seoQA(siteDir: string, pages: string[], crawl: CrawledPage[], domain: string): QASection {
  const t0 = Date.now();
  const findings: QAFinding[] = [];
  const titles = new Map<string, string[]>();
  const descs = new Map<string, string[]>();
  for (const p of pages) {
    const html = readFileSync(join(siteDir, p), 'utf8');
    const title = attr(html, /<title[^>]*>([^<]*)<\/title>/i);
    const desc = attr(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || attr(html, /<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
    const legal = /impressum|datenschutz|404/.test(p);
    if (!title) findings.push(f('major', 'Missing <title>', { page: p }));
    else { titles.set(title, [...(titles.get(title) ?? []), p]); if (title.length < 10 || title.length > 65) findings.push(f('minor', `Title length ${title.length} (aim 10–65)`, { page: p, evidence: title })); }
    if (!desc && !legal) findings.push(f('major', 'Missing meta description', { page: p }));
    else if (desc) { descs.set(desc, [...(descs.get(desc) ?? []), p]); if (!legal && (desc.length < 50 || desc.length > 165)) findings.push(f('minor', `Meta description length ${desc.length} (aim 50–160)`, { page: p })); }
    if (!/<link\s+rel=["']canonical["']/i.test(html)) findings.push(f(domain ? 'minor' : 'info', domain ? 'No canonical link' : 'No canonical link (production domain not configured)', { page: p }));
    if (!legal && !/property=["']og:title["']/i.test(html)) findings.push(f('minor', 'Open Graph og:title missing', { page: p }));
    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html) && !legal) findings.push(f('major', 'Page is set to noindex', { page: p }));
    for (const m of html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)) findings.push(f('major', 'Image without alt attribute', { page: p, evidence: m[0].slice(0, 120) }));
    if (!/^[a-z0-9-]+\.html$/.test(p) && p !== 'index.html') findings.push(f('minor', 'Non-descriptive or nested URL', { page: p }));
  }
  for (const [t, ps] of titles) if (ps.length > 1) findings.push(f('major', `Duplicate title on ${ps.join(', ')}`, { evidence: t }));
  for (const [d, ps] of descs) if (ps.length > 1) findings.push(f('minor', `Duplicate meta description on ${ps.join(', ')}`, { evidence: d.slice(0, 80) }));
  const robots = join(siteDir, 'robots.txt');
  if (!existsSync(robots)) findings.push(f('major', 'robots.txt missing'));
  else if (/Disallow:\s*\/\s*$/m.test(readFileSync(robots, 'utf8'))) findings.push(f('critical', 'robots.txt blocks the whole site'));
  const sm = join(siteDir, 'sitemap.xml');
  if (!existsSync(sm)) findings.push(f(domain ? 'major' : 'minor', domain ? 'sitemap.xml missing' : 'sitemap.xml not generated (production domain unknown — set it in website settings)'));
  else { const xml = readFileSync(sm, 'utf8'); for (const p of pages.filter((x) => !/404/.test(x))) if (!xml.includes(p === 'index.html' ? `${domain}/` : p)) findings.push(f('minor', `sitemap.xml does not list ${p}`)); }
  const home = crawl.find((c) => c.path === 'index.html');
  if (home && !home.jsonLd.length) findings.push(f('minor', 'No structured data (Schema.org) on the homepage'));
  for (const c of crawl) for (const j of c.jsonLd) { try { JSON.parse(j); } catch { findings.push(f('major', 'Invalid JSON-LD', { page: c.path })); } }
  const internal = new Set(crawl.flatMap((c) => c.links.filter((l) => !l.external).map((l) => new URL(l.href).pathname.split('/').pop() || 'index.html')));
  for (const p of pages) if (!internal.has(p) && p !== 'index.html' && !/404/.test(p)) findings.push(f('minor', 'Page is not linked from any other page (orphan)', { page: p }));
  return section('seo', 'SEO', t0, findings, { metrics: { pages: pages.length, withStructuredData: crawl.filter((c) => c.jsonLd.length).length }, summary: `${pages.length} pages checked: titles, descriptions, canonical, OG, alt text, robots, sitemap, structured data, internal links` });
}
