import { and, eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DesignSystem, PrivacyInventory } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { id, now } from '../lib/util.ts';
import { buildImprint, buildPrivacyPolicy, injectJsonLd, injectLegalContent, jsonLd } from '../legal/documents.ts';
import { loadRuleset } from '../legal/rules.ts';
import { assembleInventory } from '../privacy/inventory.ts';
import { staticScan } from '../privacy/static.ts';
import { htaccess, installFormHandler } from '../sitekit/index.ts';
import { installFont } from '../sitekit/fonts.ts';
import type { SiteContext } from './context.ts';
import { listPages } from './pages.ts';

/** Canonical company data handed to implementation agents (legal profile wins for NAP). */
export function siteData(sc: SiteContext) {
  const m = sc.customer.marketing;
  const l = sc.customer.legal;
  return {
    companyName: m.companyName,
    legalName: l.legalName,
    address: { street: l.street || m.address.street, postalCode: l.postalCode || m.address.postalCode, city: l.city || m.address.city, country: l.country || m.address.country },
    phone: m.phone || l.phone,
    email: m.email || l.email,
    openingHours: m.openingHours,
    services: m.services,
    serviceArea: m.serviceArea,
    socialProfiles: m.socialMedia,
    domain: String((sc.site.hosting as { domain?: string }).domain ?? ''),
    note: 'Use exactly these values for footer, contact page and anywhere the address appears. Do not alter spelling.',
  };
}

export function installDesignFonts(ds: DesignSystem, siteDir: string): string[] {
  const dir = join(siteDir, 'assets', 'fonts');
  const css: string[] = [];
  const pkgs: string[] = [];
  for (const t of [ds.typography.display, ds.typography.body]) {
    if (t.source !== 'self-hosted' || !t.fontsourcePackage || pkgs.includes(t.fontsourcePackage)) continue;
    try { const f = installFont(t.fontsourcePackage, dir, ''); css.push(`/* ${f.family} — ${f.license}. ${f.attribution} */\n${f.css}`); pkgs.push(f.pkg); } catch { /* not in catalog */ }
  }
  if (css.length) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'fonts.css'), css.join('\n\n') + '\n'); }
  return pkgs;
}

/** Records provenance for every asset file; agent-made graphics are "generated", fonts "open-license". */
export function registerAssets(sc: SiteContext, siteDir: string, source: string): number {
  const existing = new Set(db().select().from(schema.assets).where(eq(schema.assets.websiteId, sc.site.id)).all().map((a) => a.localPath));
  let added = 0;
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d)) {
      if (n.startsWith('.')) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const rel = relative(siteDir, p);
      if (existing.has(rel) || !/\.(svg|png|jpe?g|webp|avif|gif|ico|woff2)$/i.test(n)) continue;
      const font = n.endsWith('.woff2');
      db().insert(schema.assets).values({
        id: id('ast_'), customerId: sc.customer.id, websiteId: sc.site.id, kind: font ? 'font' : 'image', category: font ? 'open-license' : 'generated',
        source: font ? 'Fontsource (npm), SIL Open Font License 1.1' : source, license: font ? 'OFL-1.1' : 'Created for this website by the Factory/agent',
        localPath: rel, alt: '', purpose: font ? 'Self-hosted web font' : 'Graphic', reviewStatus: font ? 'approved' : 'n/a', createdAt: now(),
      }).run();
      added++;
    }
  };
  walk(siteDir);
  return added;
}

export interface FactoryPassResult { missingImprint: string[]; uncoveredServices: string[]; files: string[] }

/**
 * Deterministic Factory pass (idempotent): legal pages from verified profile + current behaviour, JSON-LD,
 * robots/sitemap, .htaccess, verified form handler. Agents never write legal text.
 */
export function factoryPass(sc: SiteContext, siteDir: string, inventory?: PrivacyInventory | null): FactoryPassResult {
  const files: string[] = [];
  const pages = listPages(siteDir).map((p) => p.path);
  const domain = String((sc.site.hosting as { domain?: string }).domain ?? '').replace(/\/$/, '');
  const scan = staticScan(siteDir);
  const hosting = sc.site.hosting as { provider?: string; location?: string; avvSigned?: 'yes' | 'no' | 'unknown' };
  if (scan.forms.some((f) => f.action === 'kontakt-senden.php')) {
    const to = sc.customer.legal.email || sc.customer.marketing.email;
    if (installFormHandler(siteDir, { to, site: sc.customer.marketing.companyName })) files.push('kontakt-senden.php', 'kontakt-config.php');
  }
  writeFileSync(join(siteDir, '.htaccess'), htaccess());
  files.push('.htaccess');
  const inv = inventory ?? assembleInventory({ scan, runtime: { requests: [], cookies: [], local: [], session: [], consoleErrors: [], pageErrors: [], banner: false }, siteDir, firstParty: 'http://localhost', hostingProvider: hosting.provider ?? '', hostingLocation: hosting.location ?? '', avvSigned: hosting.avvSigned ?? 'unknown', websiteVersion: 'draft', version: 0 });
  const imprint = buildImprint(sc.customer);
  const privacy = buildPrivacyPolicy(sc.customer, inv, { hostingProvider: hosting.provider ?? '', hostingLocation: hosting.location ?? '' });
  if (existsSync(join(siteDir, 'impressum.html'))) { injectLegalContent(join(siteDir, 'impressum.html'), 'Impressum', imprint.html); files.push('impressum.html'); }
  if (existsSync(join(siteDir, 'datenschutz.html'))) { injectLegalContent(join(siteDir, 'datenschutz.html'), 'Datenschutzerklärung', privacy.html); files.push('datenschutz.html'); }
  if (existsSync(join(siteDir, 'index.html'))) { injectJsonLd(join(siteDir, 'index.html'), jsonLd(sc.customer, sc.site.siteType, domain)); files.push('index.html'); }
  const robots = `User-agent: *\nAllow: /\nDisallow: /kontakt-config.php\n${domain ? `\nSitemap: ${domain}/sitemap.xml\n` : ''}`;
  writeFileSync(join(siteDir, 'robots.txt'), robots);
  files.push('robots.txt');
  if (domain) {
    const urls = pages.filter((p) => !/^404/.test(p)).map((p) => `  <url><loc>${domain}/${p === 'index.html' ? '' : p}</loc><lastmod>${now().slice(0, 10)}</lastmod></url>`);
    writeFileSync(join(siteDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
    files.push('sitemap.xml');
    for (const p of pages) {
      const fp = join(siteDir, p);
      let html = readFileSync(fp, 'utf8');
      const href = `${domain}/${p === 'index.html' ? '' : p}`;
      html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '').replace('</head>', `<link rel="canonical" href="${href}">\n</head>`);
      writeFileSync(fp, html);
    }
  }
  return { missingImprint: imprint.missing, uncoveredServices: privacy.uncovered, files };
}

/** Persists versioned legal documents so later audits can trace what was published when. */
export function recordLegalDocuments(sc: SiteContext, inventoryVersion: number): void {
  const rs = loadRuleset();
  for (const kind of ['impressum', 'datenschutz'] as const) {
    const p = join(sc.paths.current, `${kind}.html`);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const prev = db().select().from(schema.legalDocuments).where(and(eq(schema.legalDocuments.websiteId, sc.site.id), eq(schema.legalDocuments.kind, kind))).all().sort((a, b) => b.version - a.version)[0];
    if (prev && prev.content === content) continue;
    db().insert(schema.legalDocuments).values({
      id: id('doc_'), websiteId: sc.site.id, kind, version: (prev?.version ?? 0) + 1, websiteVersion: sc.site.currentVersion ?? 'draft', rulesetVersion: rs.version,
      inventoryVersion, content, manualEdits: false, reviewStatus: 'MANUAL_REVIEW', generatedAt: now(),
    }).run();
  }
}
