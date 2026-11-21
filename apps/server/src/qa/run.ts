import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { QA_SECTIONS, worstStatus, type CheckStatus, type LegalAudit, type PrivacyInventory, type QAFinding, type QAReport, type QASection, type VisualReview } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { id, now, readJson, writeJson } from '../lib/util.ts';
import { listPages } from '../pipeline/pages.ts';
import { siteContext } from '../pipeline/context.ts';
import type { ConsentMatrixResult } from '../privacy/consent.ts';
import { captureRuntime } from '../privacy/runtime.ts';
import { isAllowedSitekitFile } from '../sitekit/index.ts';
import { accessibilityQA } from './a11y.ts';
import { freshContext, settle } from './browser.ts';
import { crawlSite, type CrawledPage } from './crawl.ts';
import { performanceQA } from './perf.ts';
import { responsiveQA } from './responsive.ts';
import { f, section } from './section.ts';
import { securityQA } from './security.ts';
import { seoQA } from './seo.ts';

export type QAPart = 'responsive' | 'accessibility' | 'seo' | 'performance' | 'security' | 'links' | 'console' | 'network' | 'forms' | 'assets';
export const ALL_PARTS: QAPart[] = ['links', 'console', 'network', 'responsive', 'accessibility', 'seo', 'performance', 'security', 'forms', 'assets'];

function linksSection(siteDir: string, crawl: CrawledPage[], t0: number): QASection {
  const findings: QAFinding[] = [];
  let external = 0;
  for (const c of crawl) {
    if (c.status !== 200) findings.push(f('critical', `Page returns HTTP ${c.status}`, { page: c.path }));
    for (const l of c.links) {
      if (l.external) { if (/^https?:/.test(l.href)) external++; continue; }
      let u: URL;
      try { u = new URL(l.href); } catch { findings.push(f('major', 'Malformed link', { page: c.path, evidence: l.href })); continue; }
      const parts = u.pathname.split('/').filter(Boolean).slice(4);
      const target = parts.join('/') || 'index.html';
      const file = join(siteDir, decodeURIComponent(target));
      if (!existsSync(file) && !existsSync(`${file}.html`) && !existsSync(join(file, 'index.html'))) findings.push(f('major', `Broken internal link → ${target}`, { page: c.path, evidence: l.text }));
      if (u.hash && u.hash.length > 1 && target === c.path) { /* same-page anchors are checked below */ }
    }
  }
  for (const c of crawl) {
    const html = existsSync(join(siteDir, c.path)) ? readFileSync(join(siteDir, c.path), 'utf8') : '';
    for (const m of html.matchAll(/(?:src|href)=["'](?!https?:|\/\/|mailto:|tel:|#|data:|javascript:)([^"'?#]+)/gi)) {
      const ref = m[1]!;
      if (ref.endsWith('.html') || ref === '/' || ref === '') continue;
      if (!existsSync(join(siteDir, ref.replace(/^\//, '')))) findings.push(f('major', `Missing asset ${ref}`, { page: c.path }));
    }
  }
  return section('links', 'Broken Links', t0, findings, { metrics: { pages: crawl.length, externalLinks: external }, summary: `${crawl.length} pages, ${crawl.reduce((n, c) => n + c.links.length, 0)} links and all local assets checked; ${external} external links (not requested)` });
}

async function formsSection(base: string, pages: string[], siteDir: string, inv: PrivacyInventory | null, t0: number): Promise<QASection> {
  const forms = inv?.forms ?? [];
  const findings: QAFinding[] = [];
  if (!forms.length) return section('forms', 'Forms', t0, [], { status: 'NOT_APPLICABLE', summary: 'No forms on the website' });
  const ctx = await freshContext();
  try {
    const page = await ctx.newPage();
    for (const fm of forms) {
      if (fm.method !== 'post') findings.push(f('major', 'Form method is not POST', { page: fm.page }));
      if (fm.action === 'kontakt-senden.php') {
        const ok = existsSync(join(siteDir, 'kontakt-senden.php')) && isAllowedSitekitFile('kontakt-senden.php', readFileSync(join(siteDir, 'kontakt-senden.php'))) && existsSync(join(siteDir, 'kontakt-config.php'));
        if (!ok) findings.push(f('critical', 'Form handler missing or modified', { page: fm.page }));
      } else if (!fm.action) findings.push(f('critical', 'Form has no action — submissions go nowhere', { page: fm.page }));
      else findings.push(f('minor', `Form posts to ${fm.action} (not the verified handler) — review processing`, { page: fm.page }));
      for (const fld of fm.fields) if (!fld.label && fld.name !== 'website' && fld.type !== 'hidden') findings.push(f('major', `Field "${fld.name}" has no label`, { page: fm.page }));
      if (!fm.hasHoneypot) findings.push(f('minor', 'No honeypot field (spam protection without CAPTCHA)', { page: fm.page }));
      if (!fm.hasPrivacyNotice) findings.push(f('major', 'No privacy notice/link at the form', { page: fm.page }));
      await page.goto(new URL(fm.page, base).toString(), { waitUntil: 'load' });
      await settle(page, 200);
      const valid = await page.locator('form').first().evaluate((el) => (el as HTMLFormElement).checkValidity()).catch(() => null);
      if (valid === true && fm.fields.some((x) => x.required)) findings.push(f('major', 'Empty form passes client-side validation despite required fields', { page: fm.page }));
      if (valid === null) findings.push(f('major', 'Form not found in the rendered page', { page: fm.page }));
    }
  } finally { await ctx.close(); }
  findings.push(f('info', 'Server-side validation, header-injection protection and rate limiting are provided by the verified PHP handler; delivery needs PHP mail() on the hosting — test once after deployment.'));
  return section('forms', 'Forms', t0, findings, { metrics: { forms: forms.length }, summary: `${forms.length} form(s): labels, required fields, validation, handler integrity, honeypot, privacy notice` });
}

function assetsSection(websiteId: string, siteDir: string, t0: number): QASection {
  const rows = db().select().from(schema.assets).where(eq(schema.assets.websiteId, websiteId)).all();
  const findings: QAFinding[] = [];
  for (const r of rows) {
    if (r.category === 'unknown') findings.push(f('minor', `Unknown provenance: ${r.localPath} — MANUAL REVIEW REQUIRED`, { evidence: r.source }));
    if (r.category === 'customer' && r.reviewStatus !== 'approved') findings.push(f('minor', `Customer asset awaiting rights confirmation: ${r.localPath}`));
  }
  const unknownOnly = findings.length > 0;
  return section('assets', 'Assets', t0, findings, { status: unknownOnly ? 'MANUAL_REVIEW' : 'PASS', metrics: { tracked: rows.length }, summary: `${rows.length} tracked assets (fonts, images, graphics)${unknownOnly ? ' — some need rights confirmation' : ''}` });
}

/** Full technical QA. Every status here comes from an actual run; sections not run stay NOT_RUN. */
export async function runQA(websiteId: string, parts: QAPart[] = ALL_PARTS, log: (l: string) => void = () => {}): Promise<QAReport> {
  const sc = siteContext(websiteId);
  const base = sc.preview('current');
  const pages = listPages(sc.paths.current).map((p) => p.path);
  if (!pages.length) throw new Error('website has no pages yet');
  const startedAt = now();
  const sections: QASection[] = [];
  const domain = String((sc.site.hosting as { domain?: string }).domain ?? '');
  let crawl: CrawledPage[] = [];
  const t = () => Date.now();
  // Independent browser checks run concurrently on the shared browser (Lighthouse uses its own Chrome).
  log(`running ${parts.join(', ')} in parallel`);
  const crawlP = parts.some((p) => ['links', 'seo'].includes(p)) ? crawlSite(base, pages) : Promise.resolve([] as CrawledPage[]);
  const runtimeP = parts.includes('console') || parts.includes('network') ? captureRuntime(base, pages, { kind: 'none' }, 'qa') : Promise.resolve(null);
  const responsiveP = parts.includes('responsive') ? responsiveQA(base, pages, join(sc.paths.qa, 'responsive')) : Promise.resolve(null);
  const a11yP = parts.includes('accessibility') ? accessibilityQA(base, pages, sc.paths.current) : Promise.resolve(null);
  const perfP = parts.includes('performance')
    ? performanceQA(base, pages, sc.paths.current).catch((e) => section('performance', 'Performance', t(), [], { status: 'NOT_RUN', summary: `Lighthouse failed to run: ${(e as Error).message.slice(0, 200)}` }))
    : Promise.resolve(null);
  const t0 = t();
  const [crawled, rt, responsive, a11y, perf] = await Promise.all([crawlP, runtimeP, responsiveP, a11yP, perfP]);
  crawl = crawled;
  if (parts.includes('links')) sections.push(linksSection(sc.paths.current, crawl, t0));
  if (rt && parts.includes('console')) sections.push(section('console', 'Console', t0, [
    ...rt.pageErrors.map((e) => f('critical', `Uncaught error: ${e.text}`, { page: e.page })),
    ...rt.consoleErrors.map((e) => f('major', `console.error: ${e.text}`, { page: e.page })),
  ], { summary: `${pages.length} pages loaded: ${rt.pageErrors.length} runtime errors, ${rt.consoleErrors.length} console errors` }));
  if (rt && parts.includes('network')) {
    const third = rt.requests.filter((r) => !r.firstParty);
    sections.push(section('network', 'Network', t0, [
      ...[...new Set(third.map((r) => r.origin))].map((o) => f('major', `Third-party request without consent: ${o}`, { evidence: third.filter((r) => r.origin === o).map((r) => r.page).slice(0, 3).join(', ') })),
    ], { metrics: { requests: rt.requests.length, thirdParty: third.length }, summary: `${rt.requests.length} requests on first visit; ${third.length} to third parties` }));
  }
  for (const s of [responsive, a11y]) if (s) sections.push(s);
  if (parts.includes('seo')) sections.push(seoQA(sc.paths.current, pages, crawl, domain));
  if (perf) sections.push(perf);
  if (parts.includes('security')) sections.push(securityQA(sc.paths.current));
  const inv = (db().select().from(schema.privacyInventories).where(eq(schema.privacyInventories.websiteId, websiteId)).all().sort((a, b) => b.version - a.version)[0]?.data ?? null) as PrivacyInventory | null;
  if (parts.includes('forms')) sections.push(await formsSection(base, pages, sc.paths.current, inv, t()));
  if (parts.includes('assets')) sections.push(assetsSection(websiteId, sc.paths.current, t()));
  return finalizeReport(websiteId, sections, startedAt);
}

/** Merges new sections with previous results and with visual/privacy/consent/legal state into one report. */
export function finalizeReport(websiteId: string, fresh: QASection[], startedAt = now()): QAReport {
  const sc = siteContext(websiteId);
  const prev = (db().select().from(schema.qaReports).where(eq(schema.qaReports.websiteId, websiteId)).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.data ?? null) as QAReport | null;
  const version = sc.site.currentVersion ?? 'unversioned';
  const keep = (k: string) => (prev && prev.websiteVersion === version ? prev.sections.find((s) => s.key === k) : undefined);
  const byKey = new Map<string, QASection>();
  for (const [k] of QA_SECTIONS) { const s = keep(k); if (s) byKey.set(k, s); }
  for (const s of fresh) byKey.set(s.key, s);
  const visual = readJson<{ review: VisualReview; at: string; version: string }>(join(sc.paths.qa, 'visual', 'visual-review.json'));
  if (visual && visual.version === version) {
    const crit = visual.review.criteria;
    const st = worstStatus(crit.map((c) => c.status as CheckStatus));
    byKey.set('visual', { key: 'visual', label: 'Visual', status: st, summary: `Claude reviewed rendered screenshots: ${visual.review.verdict} — ${visual.review.summary.slice(0, 200)}`, findings: visual.review.findings.map((x) => f(x.severity, `${x.area}: ${x.problem}`, { page: x.page, viewport: x.viewport, selector: x.selectorHint })), metrics: { criteria: crit.length }, artifacts: [], ranAt: visual.at, durationMs: 0 });
  }
  const inv = (db().select().from(schema.privacyInventories).where(eq(schema.privacyInventories.websiteId, websiteId)).all().sort((a, b) => b.version - a.version)[0]?.data ?? null) as PrivacyInventory | null;
  if (inv && inv.websiteVersion === version) {
    byKey.set('privacy', { key: 'privacy', label: 'Privacy', status: worstStatus(inv.services.map((s) => s.status)), summary: `Inventory v${inv.version}: ${inv.services.length} processings, ${inv.undeclaredOrigins.length} undeclared origins (browser-measured)`, findings: inv.services.filter((s) => s.status !== 'PASS').map((s) => f(s.status === 'FAIL' ? 'critical' : 'minor', `${s.service}: ${s.notes.join('; ')}`, { evidence: s.endpoints.join(', ') })), metrics: { services: inv.services.length, requests: inv.requests.length }, artifacts: [], ranAt: inv.generatedAt, durationMs: 0 });
  }
  const consentRow = db().select().from(schema.consentConfigurations).where(eq(schema.consentConfigurations.websiteId, websiteId)).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const cr = consentRow?.testResults as ConsentMatrixResult | null;
  if (cr && inv && consentRow!.createdAt >= inv.generatedAt) {
    byKey.set('consent', { key: 'consent', label: 'Consent', status: cr.status, summary: cr.required ? `4 fresh-browser states tested: ${cr.runs.map((r) => `${r.state} ${r.status}`).join(', ')}` : 'Not required — no consent-dependent services or storage', findings: [...cr.runs.flatMap((r) => r.violations.map((v) => f(r.status === 'FAIL' ? 'critical' : 'minor', `[${r.state}] ${v}`))), ...cr.checks.filter((c) => c.status !== 'PASS').map((c) => f(c.status === 'FAIL' ? 'critical' : 'minor', `${c.check}: ${c.detail}`))], metrics: {}, artifacts: [], ranAt: consentRow!.createdAt, durationMs: 0 });
  }
  const audit = (db().select().from(schema.legalAudits).where(eq(schema.legalAudits.websiteId, websiteId)).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.data ?? null) as LegalAudit | null;
  if (audit && audit.websiteVersion === version) {
    for (const [k, label, src] of [['impressum', 'Impressum', 'impressum'], ['datenschutz', 'Datenschutz', 'datenschutz']] as const) {
      const s = audit.sections.find((x) => x.key === src);
      const links = audit.sections.find((x) => x.key === 'legal-links');
      const fs = [...(s?.findings ?? []), ...(links?.findings.filter((x) => x.message.includes(label)) ?? [])];
      byKey.set(k, { key: k, label, status: fs.length ? worstStatus(fs.map((x) => x.status)) : 'NOT_RUN', summary: `From legal audit (${audit.rulesetVersion})`, findings: fs.filter((x) => x.status !== 'PASS').map((x) => f(x.status === 'FAIL' ? 'critical' : 'minor', x.message, { ruleId: x.ruleId })), metrics: {}, artifacts: [], ranAt: audit.generatedAt, durationMs: 0 });
    }
  }
  const sections = QA_SECTIONS.map(([k, label]) => byKey.get(k) ?? { key: k, label, status: 'NOT_RUN' as CheckStatus, summary: 'Not run for this version', findings: [], metrics: {}, artifacts: [], ranAt: '', durationMs: 0 });
  const report: QAReport = { websiteId, websiteVersion: version, startedAt, finishedAt: now(), sections, overall: worstStatus(sections.map((s) => s.status)) };
  db().insert(schema.qaReports).values({ id: id('qar_'), websiteId, websiteVersion: version, data: report, createdAt: now() }).run();
  writeJson(join(sc.paths.qa, 'qa-report.json'), report);
  for (const s of sections) if (['responsive', 'accessibility', 'seo', 'performance', 'security', 'privacy'].includes(s.key)) writeJson(join(sc.paths.qa, s.key, `${s.key}.json`), s);
  const v = db().select().from(schema.websiteVersions).where(eq(schema.websiteVersions.dirName, version)).get();
  if (v) db().update(schema.websiteVersions).set({ qaState: report.overall }).where(eq(schema.websiteVersions.id, v.id)).run();
  return report;
}
