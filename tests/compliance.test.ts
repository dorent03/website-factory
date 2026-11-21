import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LegalProfile, MarketingProfile, worstStatus, type Customer, type Fact } from '@wf/shared';
import { assignStatuses, normalize } from '../apps/server/src/research/verify.ts';
import { extractImprintCandidates } from '../apps/server/src/research/imprint.ts';
import { contrast, ensureContrast } from '../apps/server/src/lib/contrast.ts';
import { impactAnalysis } from '../apps/server/src/privacy/impact.ts';
import { staticScan } from '../apps/server/src/privacy/static.ts';
import { assembleInventory } from '../apps/server/src/privacy/inventory.ts';
import { buildImprint } from '../apps/server/src/legal/documents.ts';
import { findAddresses } from '../apps/server/src/legal/audit.ts';
import { applies, conditions, loadRuleset } from '../apps/server/src/legal/rules.ts';
import { classifyEdit } from '../apps/server/src/pipeline/routing.ts';

const fact = (field: string, value: string, url: string, confidence = 0.9): Fact => ({ id: Math.random().toString(36), field, value, sourceUrl: url, sourceTitle: '', provider: 't', retrievedAt: '', confidence, status: 'UNVERIFIED', quote: '', note: '' });
const site = (html: Record<string, string>) => { const d = mkdtempSync(join(tmpdir(), 'wf-site-')); for (const [f, c] of Object.entries(html)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), c); } return d; };
const customer = (legal: Partial<Customer['legal']>): Customer => ({ id: 'c', slug: 'c', createdAt: '', updatedAt: '', marketing: MarketingProfile.parse({ companyName: 'Muster GmbH' }), legal: LegalProfile.parse(legal) });

describe('fact verification', () => {
  it('verifies with two independent hosts, flags conflicts, never resolves them', () => {
    const out = assignStatuses([fact('phone', '07433 123', 'https://a.de/x'), fact('phone', '+49 7433 123', 'https://b.de/y'), fact('street', 'Musterstraße 10', 'https://a.de/i'), fact('street', 'Musterstr. 12', 'https://b.de/i')]);
    expect(out.filter((f) => f.field === 'phone').every((f) => f.status === 'VERIFIED')).toBe(true);
    expect(out.filter((f) => f.field === 'street').every((f) => f.status === 'CONFLICT')).toBe(true);
  });
  it('single source is LIKELY at best', () => {
    expect(assignStatuses([fact('email', 'info@a.de', 'https://a.de')])[0]!.status).toBe('LIKELY');
    expect(assignStatuses([fact('email', 'info@a.de', 'https://a.de', 0.3)])[0]!.status).toBe('UNVERIFIED');
  });
  it('parses Impressum candidates', () => {
    const c = extractImprintCandidates('Impressum\nMüller Elektrotechnik GmbH\nHauptstraße 5\n72336 Balingen\nGeschäftsführer: Hans Müller\nRegistergericht: Amtsgericht Stuttgart HRB 123456\nUSt-IdNr.: DE123456789\nTelefon: 07433 12345');
    const get = (f: string) => c.filter((x) => x.field === f).map((x) => x.value);
    expect(get('registerNumber')).toContain('HRB 123456');
    expect(get('vatId')).toContain('DE123456789');
    expect(get('postalCode')).toContain('72336');
    expect(get('representatives')).toContain('Hans Müller');
    expect(get('legalForm')).toContain('GmbH');
  });
});

describe('design checks', () => {
  it('computes and repairs contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    const fixed = ensureContrast('#9a9a9a', '#ffffff', 4.5);
    expect(contrast(fixed, '#ffffff')!).toBeGreaterThanOrEqual(4.5);
  });
});

describe('privacy engine', () => {
  const base = '<html lang="de"><head><title>x</title></head><body><main>Hi</main><footer><a href="impressum.html">Impressum</a></footer></body></html>';
  it('impact analysis detects a new YouTube embed and its dependency path', () => {
    const a = site({ 'index.html': base });
    const b = site({ 'index.html': base.replace('Hi', '<div class="wf-embed" data-wf-category="external-media" data-wf-src="https://www.youtube-nocookie.com/embed/abc"></div>') });
    const imp = impactAnalysis(a, b);
    expect(imp.newServices.map((s) => s.key)).toContain('youtube');
    expect(imp.affected).toEqual(expect.arrayContaining(['privacy-inventory', 'consent', 'datenschutz', 'browser-qa']));
    expect(imp.requiresReaudit).toBe(true);
  });
  it('undeclared third-party request fails the inventory', () => {
    const d = site({ 'index.html': base.replace('</head>', '<script src="https://cdn.example-tracker.com/t.js"></script></head>') });
    const inv = assembleInventory({ scan: staticScan(d), runtime: { requests: [{ url: 'https://cdn.example-tracker.com/t.js', origin: 'https://cdn.example-tracker.com', resourceType: 'script', page: 'index.html', phase: 'no-consent', firstParty: false }], cookies: [], local: [], session: [], consoleErrors: [], pageErrors: [], banner: false }, siteDir: d, firstParty: 'http://localhost:3100', hostingProvider: 'X', hostingLocation: 'DE', avvSigned: 'unknown', websiteVersion: 'v1', version: 1 });
    expect(inv.undeclaredOrigins).toContain('https://cdn.example-tracker.com');
    expect(worstStatus(inv.services.map((s) => s.status))).toBe('FAIL');
  });
  it('a site without third parties needs no consent banner', () => {
    const d = site({ 'index.html': base });
    const inv = assembleInventory({ scan: staticScan(d), runtime: { requests: [], cookies: [], local: [], session: [], consoleErrors: [], pageErrors: [], banner: false }, siteDir: d, firstParty: 'http://localhost:3100', hostingProvider: 'X', hostingLocation: 'DE', avvSigned: 'unknown', websiteVersion: 'v1', version: 1 });
    expect(inv.consentRequired).toBe(false);
  });
});

describe('legal engine', () => {
  it('never invents Impressum data and reports what is missing', () => {
    const r = buildImprint(customer({ legalName: 'Muster GmbH', legalForm: 'GmbH', street: 'Weg 1', postalCode: '12345', city: 'Ort', email: 'a@b.de' }));
    expect(r.missing).toEqual(expect.arrayContaining(['representatives', 'registerCourt', 'registerNumber']));
    expect(r.html).not.toMatch(/HRB \d/);
  });
  it('finds differing addresses', () => {
    expect(findAddresses('Muster GmbH · Musterstraße 12, 72336 Balingen')[0]).toEqual({ street: 'Musterstraße 12', postalCode: '72336' });
    // A brand name glued in front of the street must not count as a different address.
    const glued = findAddresses('VYNTRAX Hebelstraße 1 78564 Wehingen')[0]!;
    expect(normalize('street', glued.street).endsWith(normalize('street', 'Hebelstraße 1'))).toBe(true);
  });
  it('loads the ruleset and applies form-specific rules', () => {
    const rs = loadRuleset();
    expect(rs.rules.length).toBeGreaterThan(20);
    expect(rs.errors).toEqual([]);
    const facts = { legal: LegalProfile.parse({ legalForm: 'GmbH' }), functionality: { contactForm: true, map: 'none', video: 'none', newsletter: false, booking: false, shop: false, jobApplications: false, userAccounts: false, analytics: 'none', socialEmbeds: false } as const, inventory: null, siteType: 'company' };
    const cond = conditions(facts);
    expect(cond.hasRegisterEntry).toBe(true);
    const reg = rs.rules.find((r) => r.id === 'de.imprint.register-entry');
    if (reg) expect(applies(reg, facts, cond)).toBe(true);
    const ag = rs.rules.find((r) => r.id === 'de.imprint.business-letters-ag');
    if (ag) expect(applies(ag, facts, cond)).toBe(false);
  });
});

describe('AUTO agent routing', () => {
  it.each([
    ['Make the design more premium.', 'design', 'Claude → Codex'],
    ['Fix mobile overflow.', 'technical', 'Codex'],
    ['Improve the text.', 'content', 'Claude → Codex'],
    ['Fix accessibility errors.', 'technical', 'Codex'],
    ['Analyze the Datenschutzerklärung.', 'analysis', 'Claude + Legal Audit'],
    ['Check whether YouTube loads before consent.', 'privacy-check', 'Codex (browser QA)'],
    ['Review final website.', 'review', 'Claude + Codex'],
  ])('%s', (msg, kind, agents) => {
    const r = classifyEdit(msg);
    expect(r.kind).toBe(kind);
    expect(r.agents).toBe(agents);
  });
});
