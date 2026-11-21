import { desc, eq } from 'drizzle-orm';
import { join } from 'node:path';
import type { CheckStatus, ConsentCategory, ConsentConfiguration, ConsentRun, PrivacyInventory } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { id, now, writeJson } from '../lib/util.ts';
import { listPages } from '../pipeline/pages.ts';
import { siteContext } from '../pipeline/context.ts';
import { freshContext, settle } from '../qa/browser.ts';
import { familyOf, KNOWN_SERVICES, matchService } from './catalog.ts';
import { captureRuntime, type ConsentAction } from './runtime.ts';
import { CONSENT_STORAGE_KEY } from './inventory.ts';

export interface ConsentMatrixResult { required: boolean; status: CheckStatus; runs: ConsentRun[]; checks: Array<{ check: string; status: CheckStatus; detail: string }> }

/**
 * Runs the four consent states in fresh browser contexts and compares actual network/storage behaviour with the
 * configuration. A consent-dependent request before (or without) consent is a FAIL.
 */
export async function runConsentMatrix(websiteId: string, inv: PrivacyInventory, config: ConsentConfiguration | null): Promise<ConsentMatrixResult> {
  const sc = siteContext(websiteId);
  const base = sc.preview('current');
  const pages = listPages(sc.paths.current).map((p) => p.path);
  const checks: ConsentMatrixResult['checks'] = [];
  if (!inv.consentRequired) {
    const rt = await captureRuntime(base, pages.slice(0, 1), { kind: 'none' }, 'no-consent');
    checks.push({ check: 'Consent mechanism needed?', status: 'PASS', detail: 'No consent-dependent services or non-essential storage detected — no banner required.' });
    if (rt.banner) checks.push({ check: 'Unnecessary banner', status: 'WARNING', detail: 'A consent banner is shown although nothing requires consent.' });
    return { required: false, status: rt.banner ? 'WARNING' : 'PASS', runs: [], checks };
  }
  if (!config) {
    checks.push({ check: 'Consent mechanism', status: 'FAIL', detail: 'Consent is required but no consent configuration exists.' });
    return { required: true, status: 'FAIL', runs: [], checks };
  }
  const optional = config.categories.filter((c) => c.key !== 'necessary').map((c) => c.key as ConsentCategory);
  const dependent = inv.services.filter((s) => s.consentDependency);
  const states: Array<{ state: ConsentRun['state']; action: ConsentAction; allowed: ConsentCategory[] }> = [
    { state: 'no-consent', action: { kind: 'none' }, allowed: [] },
    { state: 'reject-optional', action: { kind: 'reject' }, allowed: [] },
    { state: 'selected', action: { kind: 'select', categories: optional.slice(0, 1) }, allowed: optional.slice(0, 1) },
    { state: 'accept-all', action: { kind: 'accept' }, allowed: optional },
  ];
  const runs: ConsentRun[] = [];
  for (const st of states) {
    const rt = await captureRuntime(base, pages, st.action, st.state);
    const violations: string[] = [];
    // Families of consented, actually used services — their sibling hosts are part of the consented embed.
    const allowedFamilies = new Set(dependent.filter((d) => st.allowed.includes(d.consentCategory as ConsentCategory)).map((d) => KNOWN_SERVICES.find((k) => k.key === d.id)?.family).filter(Boolean) as string[]);
    for (const r of rt.requests.filter((x) => !x.firstParty)) {
      const fam = familyOf(r.origin);
      if (fam && allowedFamilies.has(fam)) continue;
      const svc = matchService(r.origin);
      const svcInv = svc ? inv.services.find((s) => s.id === svc.key) : null;
      const cat = (svcInv?.consentCategory ?? svc?.consentCategory ?? 'marketing') as ConsentCategory;
      const needs = svc ? svc.consentRequired : true;
      if (needs && !st.allowed.includes(cat)) violations.push(`${r.origin} requested on ${r.page} (${svc?.name ?? 'unknown service'}, category ${cat}) without consent for it`);
    }
    const store = [...rt.local, ...rt.session].filter((x) => x.name !== CONSENT_STORAGE_KEY);
    if (st.allowed.length === 0) for (const s of store) violations.push(`storage "${s.name}" written without consent`);
    if (st.state === 'no-consent' && !rt.banner) violations.push('consent is required but no consent dialog is shown to a first-time visitor');
    const uniq = [...new Set(violations)];
    let status: CheckStatus = uniq.length ? 'FAIL' : 'PASS';
    if (st.state === 'accept-all' && dependent.length) {
      const loaded = dependent.filter((d) => rt.requests.some((r) => d.endpoints.includes(r.origin) || matchService(r.origin)?.key === d.id));
      if (loaded.length < dependent.length && status === 'PASS') { status = 'WARNING'; uniq.push(`after "accept all", ${dependent.length - loaded.length} consented service(s) did not load (${dependent.filter((d) => !loaded.includes(d)).map((d) => d.service).join(', ')})`); }
    }
    runs.push({
      state: st.state, selection: st.allowed, status, violations: uniq,
      requests: rt.requests.slice(0, 300),
      cookies: rt.cookies.map((c) => ({ name: c.name, domain: c.domain, page: c.page, category: c.name === CONSENT_STORAGE_KEY ? 'necessary' : 'unknown', phase: st.state })),
      localStorage: rt.local.map((c) => ({ name: c.name, domain: '', page: c.page, category: c.name === CONSENT_STORAGE_KEY ? 'necessary' : 'unknown', phase: st.state })),
      sessionStorage: rt.session.map((c) => ({ name: c.name, domain: '', page: c.page, category: 'unknown', phase: st.state })),
    });
  }
  // Settings can be reopened and the choice withdrawn.
  const ctx = await freshContext();
  try {
    const page = await ctx.newPage();
    await page.goto(new URL(pages[0]!, base).toString(), { waitUntil: 'load' });
    await settle(page, 500);
    await page.locator('[data-wf-consent-accept]').first().click({ timeout: 4000 }).catch(() => {});
    await settle(page, 400);
    const link = page.locator('[data-wf-consent-open]').first();
    const hasLink = await link.isVisible().catch(() => false);
    if (hasLink) await link.click().catch(() => {});
    const reopened = hasLink && (await page.locator('.wf-consent').first().isVisible().catch(() => false));
    checks.push({ check: 'Settings can be reopened', status: reopened ? 'PASS' : 'FAIL', detail: reopened ? 'Footer link "Cookie-Einstellungen" reopens the dialog.' : 'No working link to reopen consent settings.' });
    if (reopened) {
      await page.locator('[data-wf-consent-reject]').first().click().catch(() => {});
      await settle(page, 800);
      const stored = await page.evaluate((k) => localStorage.getItem(k), CONSENT_STORAGE_KEY).catch(() => null);
      const withdrawn = !!stored && JSON.parse(stored).categories.length === 0;
      checks.push({ check: 'Consent can be withdrawn', status: withdrawn ? 'PASS' : 'FAIL', detail: withdrawn ? 'Rejecting after accepting clears optional categories and reloads.' : 'Withdrawal did not clear stored consent.' });
    }
  } finally {
    await ctx.close().catch(() => {});
  }
  const rejectBtn = runs.find((r) => r.state === 'reject-optional');
  checks.push({ check: 'Reject works', status: rejectBtn?.status === 'PASS' ? 'PASS' : 'FAIL', detail: rejectBtn?.violations.join('; ') || 'No optional requests or storage after "Nur notwendige".' });
  const all = [...runs.map((r) => r.status), ...checks.map((c) => c.status)];
  const status: CheckStatus = all.includes('FAIL') ? 'FAIL' : all.includes('WARNING') ? 'WARNING' : 'PASS';
  return { required: true, status, runs, checks };
}

export function saveConsentResult(websiteId: string, config: ConsentConfiguration | null, result: ConsentMatrixResult): void {
  const sc = siteContext(websiteId);
  db().insert(schema.consentConfigurations).values({ id: id('cns_'), websiteId, version: config?.version ?? 0, data: config ?? { required: false, categories: [], storageKey: CONSENT_STORAGE_KEY, version: 0 }, testResults: result, createdAt: now() }).run();
  writeJson(join(sc.paths.qa, 'privacy', 'consent-tests.json'), { generatedAt: now(), config, result });
}

export function latestConsent(websiteId: string): { config: ConsentConfiguration; result: ConsentMatrixResult | null } | null {
  const row = db().select().from(schema.consentConfigurations).where(eq(schema.consentConfigurations.websiteId, websiteId)).orderBy(desc(schema.consentConfigurations.createdAt)).limit(1).get();
  return row ? { config: row.data as ConsentConfiguration, result: row.testResults as ConsentMatrixResult | null } : null;
}
