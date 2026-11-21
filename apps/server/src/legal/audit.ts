import { join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { LEGAL_AUDIT_SECTIONS, LEGAL_DISCLAIMER, worstStatus, type CheckStatus, type Customer, type Functionality, type LegalAudit, type LegalFinding, type LegalRule, type PrivacyInventory } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { now } from '../lib/util.ts';
import type { ConsentMatrixResult } from '../privacy/consent.ts';
import { privacySections } from '../privacy/inventory.ts';
import { linksTo, type CrawledPage } from '../qa/crawl.ts';
import { normalize } from '../research/verify.ts';
import { applies, conditions, loadRuleset, type Facts } from './rules.ts';

export interface AuditInputs {
  customer: Customer;
  websiteId: string;
  siteType: string;
  functionality: Functionality;
  siteDir: string;
  inventory: PrivacyInventory | null;
  consent: ConsentMatrixResult | null;
  crawl: CrawledPage[];
  websiteVersion: string;
}

type CheckFn = (rule: LegalRule, inp: AuditInputs, facts: Facts) => Array<{ ok: boolean | null; message: string; evidence?: string; section?: string }>;

const norm = (s: string) => s.toLowerCase().replace(/stra(ß|ss)e\b/g, 'str').replace(/str\./g, 'str').replace(/\s+/g, ' ').trim();

/** Every street-like "Name-straße 12, 12345 City" occurrence in a text. */
export function findAddresses(text: string): Array<{ street: string; postalCode: string }> {
  const out: Array<{ street: string; postalCode: string }> = [];
  for (const m of text.matchAll(/([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]*(?:[ -][A-Za-zÄÖÜäöüß.-]+){0,3}?(?:str\.|straße|strasse|weg|platz|allee|gasse|ring|damm|ufer|steige|hof|park|markt|graben)\s?\d{1,4}\s?[a-zA-Z]?)\s*[,\n·|]?\s*(?:D-)?(\d{5})/g)) out.push({ street: m[1]!.trim(), postalCode: m[2]! });
  return out;
}

const CHECKS: Record<string, CheckFn> = {
  'imprint.fields-present': (rule, inp) => {
    const fields = ((rule.automatedCheck?.params.fields as string[]) ?? rule.requiredFields) as Array<keyof Customer['legal']>;
    const l = inp.customer.legal;
    const imp = inp.crawl.find((p) => p.path === 'impressum.html');
    const res: ReturnType<CheckFn> = [];
    for (const f of fields) {
      const v = l[f];
      const value = Array.isArray(v) ? v.join(', ') : String(v ?? '');
      if (!value.trim()) { res.push({ ok: false, message: `Pflichtangabe fehlt im Rechtsprofil: ${String(f)}` }); continue; }
      const pattern = rule.automatedCheck?.params.pattern as string | undefined;
      if (pattern && f === 'vatId' && !new RegExp(pattern).test(value.replace(/\s/g, ''))) res.push({ ok: false, message: `${String(f)} hat kein gültiges Format`, evidence: value });
      const parts = Array.isArray(v) ? v : [value];
      const onPage = imp ? parts.every((p) => norm(imp.bodyText).includes(norm(String(p)))) : false;
      if (!onPage) res.push({ ok: false, message: `${String(f)} steht nicht im veröffentlichten Impressum`, evidence: value });
      const ver = l.verification.find((x) => x.field === f);
      if (ver && !ver.confirmedByUser && ver.status !== 'VERIFIED') res.push({ ok: null, message: `${String(f)} ist nicht verifiziert (${ver.status}) — manuell bestätigen` });
    }
    if (!res.length) res.push({ ok: true, message: `Angaben vorhanden und veröffentlicht: ${fields.join(', ')}` });
    return res;
  },
  'imprint.page-reachable': (_r, inp) => legalPageCheck(inp, 'impressum.html', 'Impressum'),
  'privacy.policy-present': (_r, inp) => legalPageCheck(inp, 'datenschutz.html', 'Datenschutz'),
  'privacy.services-documented': (_r, inp) => {
    if (!inp.inventory) return [{ ok: null, message: 'Kein Privacy-Inventar vorhanden — erst Inventar erstellen' }];
    const res: ReturnType<CheckFn> = [];
    for (const s of inp.inventory.services) if (s.privacySectionKey && !s.privacySectionPresent) res.push({ ok: false, message: `${s.service} wird genutzt, die Datenschutzerklärung enthält keinen Abschnitt dazu`, evidence: s.endpoints.join(', ') });
    const present = privacySections(inp.siteDir).keys;
    const used = new Set(inp.inventory.services.map((s) => s.privacySectionKey));
    const generic = new Set(['controller', 'overview', 'rights', 'changes', 'hosting']);
    for (const k of present) if (!generic.has(k) && !used.has(k)) res.push({ ok: false, section: 'datenschutz-extra', message: `Datenschutzerklärung beschreibt „${k}“, auf der Website wurde das aber nicht festgestellt`, evidence: k });
    if (!res.length) res.push({ ok: true, message: `Alle ${inp.inventory.services.length} festgestellten Verarbeitungen sind dokumentiert` });
    return res;
  },
  'privacy.no-undeclared-third-parties': (_r, inp) => {
    if (!inp.inventory) return [{ ok: null, message: 'Kein Privacy-Inventar vorhanden' }];
    return inp.inventory.undeclaredOrigins.length
      ? inp.inventory.undeclaredOrigins.map((o) => ({ ok: false, message: `Nicht deklarierte Drittanbieter-Verbindung: ${o}`, evidence: inp.inventory!.requests.filter((r) => r.origin === o).map((r) => r.page).slice(0, 3).join(', ') }))
      : [{ ok: true, message: 'Keine nicht deklarierten Drittanbieter-Verbindungen (gemessen im Browser)' }];
  },
  'consent.required-determination': (_r, inp) => {
    if (!inp.inventory) return [{ ok: null, message: 'Kein Privacy-Inventar vorhanden' }];
    const installed = inp.inventory.services.some((s) => s.id === 'consent-tool');
    if (inp.inventory.consentRequired && !installed) return [{ ok: false, message: 'Einwilligung erforderlich, aber kein Consent-Mechanismus aktiv', evidence: inp.inventory.consentReasons.join('; ') }];
    if (!inp.inventory.consentRequired && installed) return [{ ok: false, message: 'Consent-Banner aktiv, obwohl nichts einwilligungspflichtig ist' }];
    return [{ ok: true, message: inp.inventory.consentRequired ? `Consent erforderlich und aktiv (${inp.inventory.consentReasons.length} Gründe)` : 'Kein Consent erforderlich — kein Banner (korrekt)' }];
  },
  'consent.no-prior-loading': (_r, inp) => consentRuns(inp, ['no-consent', 'reject-optional']),
  'consent.reject-works': (_r, inp) => consentChecks(inp, 'Reject works'),
  'consent.withdrawable': (_r, inp) => consentChecks(inp, 'Settings can be reopened', 'Consent can be withdrawn'),
  'fonts.no-external-without-documentation': (_r, inp) => {
    const ext = inp.inventory?.services.filter((s) => s.category === 'fonts' && s.id !== 'fonts-self-hosted') ?? [];
    return ext.length ? ext.map((s) => ({ ok: s.privacySectionPresent && !s.requestBeforeConsent, message: `${s.service}: externe Schriftarten ${s.requestBeforeConsent ? 'werden ohne Einwilligung geladen' : 'eingebunden'}`, evidence: s.endpoints.join(', ') })) : [{ ok: true, message: 'Keine externen Schriftarten-Server' }];
  },
  'forms.data-minimization': (_r, inp) => {
    const forms = inp.inventory?.forms ?? [];
    if (!forms.length) return [{ ok: true, message: 'Keine Formulare' }];
    const allowed = new Set(['name', 'email', 'message', 'nachricht', 'phone', 'telefon', 'subject', 'betreff', 'website', 'wf_t']);
    const res: ReturnType<CheckFn> = [];
    for (const f of forms) {
      const extra = f.fields.filter((x) => x.required && !['name', 'email', 'message', 'nachricht'].includes(x.name.toLowerCase()));
      if (extra.length) res.push({ ok: false, message: `${f.page}: zusätzliche Pflichtfelder (${extra.map((x) => x.name).join(', ')}) — nur erforderliche Daten als Pflicht abfragen` });
      const unusual = f.fields.filter((x) => !allowed.has(x.name.toLowerCase()));
      if (unusual.length) res.push({ ok: null, message: `${f.page}: weitere Felder (${unusual.map((x) => x.name).join(', ')}) — Erforderlichkeit prüfen` });
      if (!f.hasPrivacyNotice) res.push({ ok: false, message: `${f.page}: kein Hinweis/Link zur Datenschutzerklärung am Formular` });
    }
    if (!res.length) res.push({ ok: true, message: `${forms.length} Formular(e) mit minimalen Pflichtfeldern und Datenschutzhinweis` });
    return res;
  },
  'forms.transport-security': (_r, inp) => {
    const forms = inp.inventory?.forms ?? [];
    const http = forms.filter((f) => /^http:\/\//i.test(f.action));
    const hta = existsSync(join(inp.siteDir, '.htaccess'));
    if (http.length) return http.map((f) => ({ ok: false, message: `${f.page}: Formular sendet unverschlüsselt an ${f.action}` }));
    return [{ ok: hta ? true : null, message: hta ? 'Formulare senden relativ; .htaccess erzwingt HTTPS' : 'HTTPS-Erzwingung beim Hoster prüfen (keine .htaccess-Weiterleitung vorhanden)' }];
  },
  'company.consistency': (_r, inp) => consistency(inp),
  'assets.provenance-known': (_r, inp) => {
    const imgs = listImages(inp.siteDir);
    const rows = db().select().from(schema.assets).where(eq(schema.assets.websiteId, inp.websiteId)).all();
    const res: ReturnType<CheckFn> = [];
    for (const img of imgs) {
      const a = rows.find((r) => r.localPath === img);
      if (!a || a.category === 'unknown') res.push({ ok: null, message: `${img}: Herkunft/Lizenz unbekannt — manuelle Prüfung` });
      else if (a.category === 'customer' && a.reviewStatus !== 'approved') res.push({ ok: null, message: `${img}: vom Kunden/Kunden-Website — Nutzungsrechte bestätigen` });
    }
    if (!res.length) res.push({ ok: true, message: imgs.length ? `${imgs.length} Bilddateien mit bekannter Herkunft` : 'Keine Bilddateien (nur Code/SVG-Grafik)' });
    return res;
  },
  'accessibility.bfsg-applicability': (_r, inp, facts) => {
    if (!facts.legal.sellsToConsumers) return [{ ok: true, message: 'Keine Verbraucherdienstleistung im elektronischen Geschäftsverkehr angegeben — BFSG voraussichtlich nicht anwendbar' }];
    return [{ ok: null, message: `B2C-Angebot: Anwendbarkeit des BFSG prüfen (Mitarbeiterzahl: ${facts.legal.employeeCountBand}; Shop/Buchung: ${facts.functionality.shop || facts.functionality.booking ? 'ja' : 'nein'})` }];
  },
  'module.manual-review': () => [{ ok: null, message: 'Automatisierte Prüfung nicht ausreichend' }],
};

function legalPageCheck(inp: AuditInputs, file: string, label: string): ReturnType<CheckFn> {
  const target = inp.crawl.find((p) => p.path === file);
  const res: ReturnType<CheckFn> = [];
  if (!target) return [{ ok: false, section: 'legal-links', message: `${file} existiert nicht` }];
  if (target.status !== 200) res.push({ ok: false, section: 'legal-links', message: `${file} liefert HTTP ${target.status}` });
  if (target.redirects > 3) res.push({ ok: false, section: 'legal-links', message: `${file}: Weiterleitungsschleife (${target.redirects})` });
  if (target.mainTextLength < 150) res.push({ ok: false, section: 'legal-links', message: `${file} ist (nahezu) leer` });
  if (!new RegExp(label, 'i').test(target.title + target.bodyText.slice(0, 400))) res.push({ ok: false, section: 'legal-links', message: `${file} ist nicht eindeutig als „${label}“ bezeichnet` });
  const missing = inp.crawl.filter((p) => p.path !== file && !p.links.some((l) => l.inFooter && new RegExp(label, 'i').test(l.text) && linksTo({ ...p, links: [l] }, file)));
  if (missing.length) res.push({ ok: false, section: 'legal-links', message: `${label}-Link fehlt im Footer von: ${missing.map((p) => p.path).join(', ')}` });
  if (!res.length) res.push({ ok: true, section: 'legal-links', message: `${label}: erreichbar, eindeutig benannt und auf allen ${inp.crawl.length} Seiten im Footer verlinkt` });
  return res;
}

function consentRuns(inp: AuditInputs, states: string[]): ReturnType<CheckFn> {
  if (!inp.consent) return [{ ok: null, message: 'Consent-Tests wurden nicht ausgeführt' }];
  if (!inp.consent.required) return [{ ok: true, message: 'Keine einwilligungspflichtigen Dienste — nichts darf vorab laden, nichts lädt' }];
  const runs = inp.consent.runs.filter((r) => states.includes(r.state));
  const bad = runs.filter((r) => r.status === 'FAIL');
  return bad.length ? bad.flatMap((r) => r.violations.map((v) => ({ ok: false, message: `[${r.state}] ${v}` }))) : [{ ok: true, message: `Keine einwilligungspflichtigen Anfragen vor Einwilligung (${runs.map((r) => r.state).join(', ')})` }];
}

function consentChecks(inp: AuditInputs, ...names: string[]): ReturnType<CheckFn> {
  if (!inp.consent) return [{ ok: null, message: 'Consent-Tests wurden nicht ausgeführt' }];
  if (!inp.consent.required) return [{ ok: true, message: 'Kein Consent erforderlich' }];
  return inp.consent.checks.filter((c) => names.includes(c.check)).map((c) => ({ ok: c.status === 'PASS', message: `${c.check}: ${c.detail}` }));
}

function listImages(dir: string, root = dir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listImages(p, root, out);
    else if (/\.(png|jpe?g|webp|avif|gif)$/i.test(n)) out.push(p.slice(root.length + 1));
  }
  return out;
}

/** Profile vs footer vs contact page vs Impressum vs structured data. Any other address = FAIL. */
function consistency(inp: AuditInputs): ReturnType<CheckFn> {
  const l = inp.customer.legal;
  const res: ReturnType<CheckFn> = [];
  if (!l.street || !l.postalCode) return [{ ok: null, message: 'Rechtsprofil ohne Adresse — Konsistenz nicht prüfbar' }];
  const want = normalize('street', l.street);
  const check = (where: string, text: string) => {
    for (const a of findAddresses(text)) {
      // Flattened text can glue a preceding word (e.g. the company name) onto the street — compare by suffix.
      const got = normalize('street', a.street);
      const same = got === want || got.endsWith(want) || want.endsWith(got);
      if (!same || a.postalCode !== l.postalCode.trim()) res.push({ ok: false, message: `${where}: Adresse „${a.street}, ${a.postalCode}“ weicht vom Rechtsprofil ab („${l.street}, ${l.postalCode}“)`, evidence: a.street });
    }
  };
  for (const p of inp.crawl) check(`Footer ${p.path}`, p.footerText);
  for (const f of ['impressum.html', 'kontakt.html', 'datenschutz.html']) { const p = inp.crawl.find((x) => x.path === f); if (p) check(f, p.bodyText); }
  const imp = inp.crawl.find((p) => p.path === 'impressum.html');
  if (imp && l.legalName && !norm(imp.bodyText).includes(norm(l.legalName))) res.push({ ok: false, message: `Impressum nennt nicht den Rechtsnamen „${l.legalName}“` });
  for (const p of inp.crawl) for (const raw of p.jsonLd) {
    try {
      const d = JSON.parse(raw);
      const addr = d.address ?? {};
      if (addr.streetAddress && !normalize('street', addr.streetAddress).endsWith(want)) res.push({ ok: false, section: 'structured-data', message: `Strukturierte Daten (${p.path}): streetAddress „${addr.streetAddress}“ ≠ Profil`, evidence: addr.streetAddress });
      if (addr.postalCode && addr.postalCode !== l.postalCode) res.push({ ok: false, section: 'structured-data', message: `Strukturierte Daten (${p.path}): postalCode ≠ Profil` });
      if (d.legalName && l.legalName && norm(d.legalName) !== norm(l.legalName)) res.push({ ok: false, section: 'structured-data', message: `Strukturierte Daten (${p.path}): legalName ≠ Profil` });
    } catch { res.push({ ok: false, section: 'structured-data', message: `Ungültiges JSON-LD auf ${p.path}` }); }
  }
  if (!res.length) res.push({ ok: true, message: 'Adresse und Name stimmen in Profil, Footer, Kontakt, Impressum und strukturierten Daten überein' });
  return res;
}

function sectionFor(rule: LegalRule): string {
  const c = rule.automatedCheck?.checkId ?? '';
  if (c === 'company.consistency') return 'consistency';
  if (c.startsWith('imprint.')) return 'impressum';
  if (c === 'privacy.no-undeclared-third-parties') return 'third-parties';
  if (c.startsWith('privacy.')) return 'datenschutz';
  if (c.startsWith('consent.')) return 'consent';
  if (c.startsWith('fonts.')) return 'fonts';
  if (c.startsWith('forms.')) return 'forms';
  if (c.startsWith('assets.')) return 'assets';
  if (c.startsWith('accessibility.')) return 'accessibility';
  if (rule.category === 'imprint') return 'impressum';
  if (rule.category === 'privacy') return 'datenschutz';
  if (rule.category === 'consent') return 'consent';
  if (rule.category === 'accessibility') return 'accessibility';
  return 'modules';
}

/** Runs every applicable rule. Never produces a percentage; uncertainty is MANUAL_REVIEW, never PASS. */
export function runLegalAudit(inp: AuditInputs): LegalAudit {
  const rs = loadRuleset();
  const facts: Facts = { legal: inp.customer.legal, functionality: inp.functionality, inventory: inp.inventory, siteType: inp.siteType };
  const cond = conditions(facts);
  const bySection = new Map<string, LegalFinding[]>(LEGAL_AUDIT_SECTIONS.map(([k]) => [k, []]));
  const manual: string[] = [];
  const blocking: string[] = [];
  for (const rule of rs.rules) {
    if (!applies(rule, facts, cond)) continue;
    const fn = rule.automatedCheck ? CHECKS[rule.automatedCheck.checkId] : undefined;
    const results = fn ? fn(rule, inp, facts) : [{ ok: null, message: `Kein automatisierter Check für ${rule.automatedCheck?.checkId ?? 'diese Regel'}` }];
    for (const r of results) {
      const status: CheckStatus = r.ok === true ? 'PASS' : r.ok === null ? 'MANUAL_REVIEW' : rule.severity === 'blocker' || rule.severity === 'major' ? 'FAIL' : 'WARNING';
      const sec = r.section ?? sectionFor(rule);
      bySection.get(sec)?.push({ ruleId: rule.id, status, message: r.message, evidence: r.evidence ?? '', sourceUrl: rule.sources[0]?.url ?? '', severity: rule.severity });
      if (status === 'FAIL') blocking.push(`${rule.title}: ${r.message}`);
      if (status === 'MANUAL_REVIEW') manual.push(`${rule.title}: ${r.message}`);
    }
    if (rule.manualCheck && fn && rule.automatedCheck?.checkId !== 'module.manual-review') manual.push(`${rule.title}: ${rule.manualCheck}`);
    if (rule.automatedCheck?.checkId === 'module.manual-review' && rule.manualCheck) manual.push(`${rule.title}: ${rule.manualCheck}`);
  }
  if (inp.inventory) {
    const inv = bySection.get('inventory')!;
    for (const s of inp.inventory.services) inv.push({ ruleId: `inventory.${s.id}`, status: s.status, message: `${s.service} — ${s.notes.join('; ') || (s.consentDependency ? 'lädt nur nach Einwilligung' : 'dokumentiert')}`, evidence: s.endpoints.join(', '), sourceUrl: '', severity: 'major' });
  } else bySection.get('inventory')!.push({ ruleId: 'inventory.missing', status: 'NOT_RUN', message: 'Privacy-Inventar fehlt', evidence: '', sourceUrl: '', severity: 'blocker' });
  manual.push('Endgültige Formulierung von Impressum und Datenschutzerklärung juristisch prüfen lassen (Textbausteine der Factory).');
  const sections = LEGAL_AUDIT_SECTIONS.map(([key, label]) => {
    // Several rules share a check; report each distinct result once (first rule wins, the others are listed in ruleId).
    const seen = new Map<string, LegalFinding>();
    for (const f of bySection.get(key) ?? []) {
      const k = `${f.status}|${f.message}`;
      const prev = seen.get(k);
      if (prev) prev.ruleId = `${prev.ruleId}, ${f.ruleId}`; else seen.set(k, { ...f });
    }
    const findings = [...seen.values()];
    return { key, label, status: findings.length ? worstStatus(findings.map((f) => f.status)) : ('NOT_APPLICABLE' as CheckStatus), findings };
  });
  const anyFail = sections.some((s) => s.status === 'FAIL');
  return {
    generatedAt: now(), websiteVersion: inp.websiteVersion, rulesetVersion: rs.version, inventoryVersion: inp.inventory?.version ?? 0,
    sections, overall: anyFail ? 'TECHNICAL_COMPLIANCE_CHECK_FAILED' : 'TECHNICAL_COMPLIANCE_CHECK_PASSED',
    manualReview: [...new Set(manual)], blockingReasons: [...new Set(blocking)], disclaimer: LEGAL_DISCLAIMER,
  };
}

export function auditToText(a: LegalAudit): string {
  const lines = [`LEGAL / COMPLIANCE AUDIT — Website-Version ${a.websiteVersion}`, `Regelwerk ${a.rulesetVersion} · Inventar v${a.inventoryVersion} · ${a.generatedAt}`, ''];
  for (const s of a.sections) lines.push(`${s.label.padEnd(20, '.')} ${s.status.replace('_', ' ')}`);
  lines.push('', `Overall: ${a.overall.replace(/_/g, ' ')}`, '', 'Blockierend:', ...a.blockingReasons.map((r) => `  - ${r}`), '', 'MANUAL REVIEW REQUIRED:', ...a.manualReview.map((r) => `  - ${r}`), '', a.disclaimer);
  return lines.join('\n');
}
