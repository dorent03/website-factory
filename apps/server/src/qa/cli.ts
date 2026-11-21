/**
 * npm run qa — self-test of the browser QA, privacy, consent and legal engines against a fixture site,
 * in an isolated temporary sandbox (never touches the real sites/ folder or database).
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'wf-qa-'));
process.env.WF_SITES_ROOT = join(tmp, 'sites');
process.env.WF_DATA_DIR = join(tmp, 'data');
process.env.WF_PREVIEW_PORT = process.env.WF_PREVIEW_PORT ?? '3199';

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const expect = (name: string, ok: boolean, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m'} ${name}${detail ? ` — ${detail}` : ''}`); };

async function main() {
  const { openDb } = await import('../db/index.ts');
  openDb();
  const { startPreviewServer } = await import('../preview/server.ts');
  await startPreviewServer();
  const { createCustomer } = await import('../storage/customers.ts');
  const { createWebsite } = await import('../storage/websites.ts');
  const { commitCurrent } = await import('../storage/versions.ts');
  const { siteContext } = await import('../pipeline/context.ts');
  const { factoryPass } = await import('../pipeline/factory.ts');
  const { buildInventory, consentConfigFor } = await import('../privacy/inventory.ts');
  const { runConsentMatrix } = await import('../privacy/consent.ts');
  const { installConsent } = await import('../sitekit/index.ts');
  const { runQA } = await import('./run.ts');
  const { crawlSite } = await import('./crawl.ts');
  const { runLegalAudit } = await import('../legal/audit.ts');
  const { listPages } = await import('../pipeline/pages.ts');
  const { closeBrowser } = await import('./browser.ts');

  const c = createCustomer({
    marketing: { companyName: 'Selbsttest GmbH', email: 'test@example.org', address: { street: 'Teststraße 1', postalCode: '10115', city: 'Berlin' } },
    legal: { legalName: 'Selbsttest GmbH', legalForm: 'GmbH', street: 'Teststraße 1', postalCode: '10115', city: 'Berlin', email: 'test@example.org', representatives: ['Erika Mustermann'], registerCourt: 'Amtsgericht Berlin (Charlottenburg)', registerNumber: 'HRB 000000 B' },
  });
  const w = await createWebsite(c.id, { name: 'Selbsttest', siteType: 'company', functionality: { video: 'youtube' }, hosting: { provider: 'Selbsttest Hosting GmbH', location: 'Deutschland', domain: 'https://www.example.org' } });
  const sc = () => siteContext(w.id);
  const cur = sc().paths.current;
  cpSync(resolve(import.meta.dirname, '../../../../tests/fixtures/site'), cur, { recursive: true });
  factoryPass(sc(), cur, null);
  await commitCurrent(w.id, { label: 'fixture', agent: 'test', provider: 'test', model: '', prompt: 'fixture' });

  console.log('\nPrivacy & consent');
  let inv = await buildInventory(w.id);
  expect('YouTube detected as consent-dependent', inv.services.some((s) => s.id === 'youtube' && s.consentDependency), inv.services.map((s) => s.id).join(','));
  expect('no YouTube request before consent', !inv.requests.some((r) => /youtube/.test(r.origin)));
  expect('consent required', inv.consentRequired);
  const cfg = consentConfigFor(inv);
  installConsent(cur, cfg);
  factoryPass(sc(), cur, inv);
  await commitCurrent(w.id, { label: 'consent', agent: 'test', provider: 'test', model: '', prompt: 'consent' });
  inv = await buildInventory(w.id);
  expect('Datenschutz documents YouTube', inv.services.find((s) => s.id === 'youtube')?.privacySectionPresent === true);
  expect('no undeclared origins', inv.undeclaredOrigins.length === 0, inv.undeclaredOrigins.join(','));
  const consent = await runConsentMatrix(w.id, inv, cfg);
  for (const r of consent.runs) expect(`consent state ${r.state}`, r.status !== 'FAIL', r.violations.join('; '));
  for (const ch of consent.checks) expect(`consent: ${ch.check}`, ch.status === 'PASS', ch.detail);
  const accept = consent.runs.find((r) => r.state === 'accept-all');
  expect('YouTube loads after accept-all', !!accept?.requests.some((r) => /youtube/.test(r.origin)));

  console.log('\nBrowser QA');
  const qa = await runQA(w.id);
  for (const s of qa.sections.filter((x) => !['visual'].includes(x.key))) expect(`QA ${s.label}: ${s.status}`, s.status !== 'FAIL' && s.status !== 'NOT_RUN' || ['privacy', 'consent', 'impressum', 'datenschutz'].includes(s.key), s.summary.slice(0, 140));

  console.log('\nLegal audit');
  const audit = async () => runLegalAudit({ customer: sc().customer, websiteId: w.id, siteType: 'company', functionality: sc().site.functionality as never, siteDir: cur, inventory: inv, consent, crawl: await crawlSite(sc().preview('current'), listPages(cur).map((p) => p.path)), websiteVersion: sc().site.currentVersion ?? '' });
  const a1 = await audit();
  for (const s of a1.sections) if (s.status === 'FAIL') console.log(`    ${s.label}: ${s.findings.filter((f) => f.status === 'FAIL').map((f) => f.message).join(' | ')}`);
  expect('legal audit passes technically', a1.overall === 'TECHNICAL_COMPLIANCE_CHECK_PASSED', a1.blockingReasons.slice(0, 3).join(' | '));
  expect('manual review items surfaced', a1.manualReview.length > 0, `${a1.manualReview.length} items`);

  console.log('\nNegative tests');
  const idx = join(cur, 'index.html');
  const orig = readFileSync(idx, 'utf8');
  writeFileSync(idx, orig.replace('</head>', '<script src="https://tracker.example.invalid/t.js"></script></head>'));
  inv = await buildInventory(w.id);
  expect('undeclared third-party request → privacy FAIL', inv.undeclaredOrigins.includes('https://tracker.example.invalid') && inv.services.some((s) => s.status === 'FAIL'));
  writeFileSync(idx, orig);
  inv = await buildInventory(w.id);
  expect('removed again → no undeclared origins', inv.undeclaredOrigins.length === 0);
  const kon = join(cur, 'kontakt.html');
  const k0 = readFileSync(kon, 'utf8');
  writeFileSync(kon, k0.replace('Teststraße 1 · 10115', 'Teststraße 12 · 10115'));
  const a2 = await audit();
  expect('inconsistent address → legal FAIL', a2.sections.find((s) => s.key === 'consistency')?.status === 'FAIL', a2.sections.find((s) => s.key === 'consistency')?.findings[0]?.message);
  writeFileSync(kon, k0);
  const a3 = await audit();
  expect('fixed → consistency PASS', a3.sections.find((s) => s.key === 'consistency')?.status === 'PASS');

  await closeBrowser();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — ${failed.length} failed` : ''}`);
  if (!process.env.WF_QA_KEEP) rmSync(tmp, { recursive: true, force: true }); else console.log(`sandbox kept at ${tmp}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
