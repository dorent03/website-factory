import { desc, eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsentCategory, ConsentConfiguration, PrivacyInventory, PrivacyService, StorageEntry } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { id, now, writeJson } from '../lib/util.ts';
import { listPages } from '../pipeline/pages.ts';
import { siteContext } from '../pipeline/context.ts';
import { KNOWN_SERVICES, matchService } from './catalog.ts';
import { captureRuntime, type RuntimeCapture } from './runtime.ts';
import { staticScan, type StaticScan } from './static.ts';

export const CONSENT_STORAGE_KEY = 'wf-consent';
const CONSENT_LABELS: Record<ConsentCategory, [string, string]> = {
  necessary: ['Notwendig', 'Technisch erforderliche Speicherung Ihrer Auswahl.'],
  preferences: ['Präferenzen', 'Speichert Einstellungen wie Sprache oder Darstellung.'],
  analytics: ['Statistik', 'Hilft uns zu verstehen, wie die Website genutzt wird.'],
  marketing: ['Marketing', 'Inhalte und Messungen von Werbe- oder Social-Media-Anbietern.'],
  'external-media': ['Externe Medien', 'Videos, Karten und andere Inhalte externer Anbieter.'],
};

/** Sections actually present in the published Datenschutzerklärung (factory markers, plus headings for imported sites). */
export function privacySections(siteDir: string): { present: boolean; keys: Set<string>; text: string } {
  const p = join(siteDir, 'datenschutz.html');
  if (!existsSync(p)) return { present: false, keys: new Set(), text: '' };
  const html = readFileSync(p, 'utf8');
  const keys = new Set([...html.matchAll(/data-wf-section\s*=\s*["']([a-z0-9-]+)["']/g)].map((m) => m[1]!));
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  const heuristics: Record<string, RegExp> = { youtube: /youtube/, vimeo: /vimeo/, 'google-maps': /google maps/, openstreetmap: /openstreetmap/, 'google-fonts': /google fonts/, analytics: /analytics|reichweitenmessung/, hosting: /server-?log|hosting/, 'contact-form': /kontaktformular/, email: /e-mail/ };
  for (const [k, re] of Object.entries(heuristics)) if (!keys.has(k) && re.test(text) && !html.includes('data-wf-section')) keys.add(k);
  return { present: text.trim().length > 200, keys, text };
}

function isConsentInstalled(siteDir: string): boolean {
  const p = join(siteDir, 'index.html');
  return existsSync(p) && readFileSync(p, 'utf8').includes('id="wf-consent-config"');
}

function classifyStorage(name: string): ConsentCategory | 'unknown' {
  if (name === CONSENT_STORAGE_KEY) return 'necessary';
  return 'unknown';
}

export interface InventoryInputs { scan: StaticScan; runtime: RuntimeCapture; siteDir: string; firstParty: string; hostingProvider: string; hostingLocation: string; avvSigned: 'yes' | 'no' | 'unknown'; websiteVersion: string; version: number }

/** Pure assembly of the inventory from observations (unit-testable). */
export function assembleInventory(inp: InventoryInputs): PrivacyInventory {
  const sections = privacySections(inp.siteDir);
  const consentInstalled = isConsentInstalled(inp.siteDir);
  const services: PrivacyService[] = [];
  const base = (p: Partial<PrivacyService> & Pick<PrivacyService, 'id' | 'service' | 'provider' | 'category' | 'purpose' | 'privacySectionKey'>): PrivacyService => ({
    consentCategory: 'necessary', dataInvolved: [], loading: 'always', endpoints: [], cookies: [], localStorage: [], sessionStorage: [], consentDependency: false,
    privacySectionPresent: sections.keys.has(p.privacySectionKey), requestBeforeConsent: false, detectedBy: ['static'], status: 'PASS', notes: [], ...p,
  });
  services.push(base({
    id: 'hosting', service: 'Hosting & Server-Logfiles', provider: inp.hostingProvider || 'nicht angegeben', category: 'hosting', purpose: 'Auslieferung der Website, Server-Logfiles',
    privacySectionKey: 'hosting', dataInvolved: ['IP-Adresse', 'Datum/Uhrzeit', 'URL', 'Referrer', 'User-Agent'], detectedBy: ['declared'],
    status: inp.hostingProvider ? 'PASS' : 'MANUAL_REVIEW', notes: inp.hostingProvider ? [] : ['Hoster unbekannt — Name, Sitz und AV-Vertrag manuell ergänzen'],
  }));
  if (inp.scan.forms.length) services.push(base({ id: 'contact-form', service: 'Kontaktformular', provider: 'Website-Betreiber (PHP-Mailversand beim Hoster)', category: 'forms', purpose: 'Bearbeitung von Anfragen', privacySectionKey: 'contact-form', loading: 'on-submit', dataInvolved: [...new Set(inp.scan.forms.flatMap((f) => f.fields.map((x) => x.name)).filter((n) => n && n !== 'website' && n !== 'wf_t'))] }));
  if (inp.scan.mailto) services.push(base({ id: 'email', service: 'Kontakt per E-Mail', provider: 'Website-Betreiber', category: 'forms', purpose: 'Kommunikation per E-Mail', privacySectionKey: 'email', loading: 'on-submit', dataInvolved: ['E-Mail-Adresse', 'Inhalt der Nachricht'] }));
  if (inp.scan.localFonts.length) services.push(base({ id: 'fonts-self-hosted', service: 'Lokal eingebundene Schriftarten', provider: 'Website-Betreiber (eigener Server)', category: 'fonts', purpose: 'Darstellung von Schriften ohne Drittanbieter', privacySectionKey: 'fonts-self-hosted', endpoints: inp.scan.localFonts.slice(0, 6) }));
  if (consentInstalled) services.push(base({ id: 'consent-tool', service: 'Einwilligungsverwaltung', provider: 'Website-Betreiber (selbst gehostet)', category: 'necessary', purpose: 'Speicherung der Einwilligungsentscheidung', privacySectionKey: 'consent-tool', localStorage: [CONSENT_STORAGE_KEY] }));

  // Third-party origins: static references and runtime requests (no consent given).
  const thirdStatic = inp.scan.refs.filter((r) => r.origin !== inp.firstParty);
  const thirdRuntime = inp.runtime.requests.filter((r) => !r.firstParty);
  const origins = new Set([...thirdStatic.map((r) => r.origin), ...thirdRuntime.map((r) => r.origin)]);
  const grouped = new Map<string, { svc: ReturnType<typeof matchService>; origins: Set<string> }>();
  for (const o of origins) {
    const svc = matchService(o);
    const key = svc?.key ?? `unknown:${o}`;
    const g = grouped.get(key) ?? { svc, origins: new Set<string>() };
    g.origins.add(o);
    grouped.set(key, g);
  }
  const undeclared: string[] = [];
  for (const [key, g] of grouped) {
    const before = thirdRuntime.filter((r) => g.origins.has(r.origin));
    const statics = thirdStatic.filter((r) => g.origins.has(r.origin));
    const detectedBy: PrivacyService['detectedBy'] = [...new Set([...(statics.length ? ['static' as const] : []), ...(before.length ? ['runtime' as const] : [])])];
    const gatedOnly = statics.length > 0 && statics.every((s) => s.gated);
    if (!g.svc) {
      undeclared.push(...g.origins);
      services.push(base({ id: key, service: `Unbekannter Drittanbieter (${[...g.origins][0]})`, provider: 'unbekannt', category: 'other', purpose: 'unbekannt', privacySectionKey: '', privacySectionPresent: false, endpoints: [...g.origins], detectedBy, requestBeforeConsent: before.length > 0, status: 'FAIL', notes: [`Nicht deklarierte Verbindung zu ${[...g.origins].join(', ')} — entfernen oder in Inventar, Consent und Datenschutzerklärung aufnehmen`] }));
      continue;
    }
    const s = g.svc;
    const notes: string[] = [];
    const present = sections.keys.has(s.sectionKey);
    let status: PrivacyService['status'] = 'PASS';
    if (!present) { status = 'FAIL'; notes.push(`Datenschutzerklärung enthält keinen Abschnitt „${s.name}“`); undeclared.push(...g.origins); }
    if (s.consentRequired && before.length) { status = 'FAIL'; notes.push(`${before.length} Anfrage(n) an ${s.name} vor Einwilligung`); }
    if (s.consentRequired && !consentInstalled) { status = 'FAIL'; notes.push('Einwilligungspflichtig, aber kein Consent-Mechanismus aktiv'); }
    if (s.category === 'cdn' || s.category === 'fonts') { if (status === 'PASS') status = 'WARNING'; notes.push('Selbst hosten bevorzugt — einfache Websites sollten keine Drittanbieter zum Rendern benötigen'); }
    services.push(base({
      id: key, service: s.name, provider: s.provider, category: s.category, consentCategory: s.consentCategory, purpose: s.purpose, dataInvolved: s.data,
      loading: gatedOnly ? 'after-consent' : before.length ? 'always' : 'unknown', endpoints: [...g.origins], consentDependency: s.consentRequired,
      privacySectionKey: s.sectionKey, privacySectionPresent: present, requestBeforeConsent: before.length > 0, detectedBy, status, notes,
    }));
  }
  const storage = (list: Array<{ name: string; page: string; domain?: string }>, phase: string): StorageEntry[] => list.map((x) => ({ name: x.name, domain: x.domain ?? '', page: x.page, category: classifyStorage(x.name), phase }));
  const cookies = storage(inp.runtime.cookies, 'no-consent');
  const local = storage(inp.runtime.local, 'no-consent');
  const session = storage(inp.runtime.session, 'no-consent');
  const consentReasons: string[] = [];
  for (const s of services) if (s.consentDependency) consentReasons.push(`${s.service}: Einbindung erfordert vorherige Einwilligung (§ 25 TDDDG / DSGVO)`);
  for (const st of [...cookies, ...local, ...session]) if (st.category === 'unknown') consentReasons.push(`Speicherung „${st.name}“ ohne Einwilligung — nicht als technisch notwendig klassifiziert`);
  for (const a of inp.scan.storageApis) consentReasons.push(`Script ${a.file} nutzt ${a.api} — Zweck manuell prüfen`);
  const consentRequired = services.some((s) => s.consentDependency) || [...cookies, ...local, ...session].some((s) => s.category === 'unknown');
  return {
    version: inp.version, websiteVersion: inp.websiteVersion, generatedAt: now(),
    hosting: { provider: inp.hostingProvider, location: inp.hostingLocation, serverLogs: true, avvSigned: inp.avvSigned },
    services, forms: inp.scan.forms, cookies, localStorage: local, sessionStorage: session,
    requests: inp.runtime.requests.slice(0, 500), undeclaredOrigins: [...new Set(undeclared)], consentRequired, consentReasons: [...new Set(consentReasons)], stale: false, staleReason: '',
  };
}

export function consentConfigFor(inv: PrivacyInventory, prevVersion = 0): ConsentConfiguration {
  const cats = new Map<ConsentCategory, string[]>();
  for (const s of inv.services) if (s.consentDependency && s.consentCategory !== 'necessary') cats.set(s.consentCategory, [...(cats.get(s.consentCategory) ?? []), s.service]);
  return {
    required: inv.consentRequired,
    categories: [
      { key: 'necessary', label: CONSENT_LABELS.necessary[0], description: CONSENT_LABELS.necessary[1], services: ['Einwilligungsverwaltung'] },
      ...[...cats.entries()].map(([key, services]) => ({ key, label: CONSENT_LABELS[key][0], description: `${CONSENT_LABELS[key][1]} (${services.join(', ')})`, services })),
    ],
    storageKey: CONSENT_STORAGE_KEY,
    version: prevVersion + 1,
  };
}

/** Builds and persists a fresh inventory from a real browser run plus a source scan. */
export async function buildInventory(websiteId: string): Promise<PrivacyInventory> {
  const sc = siteContext(websiteId);
  const base = sc.preview('current');
  const pages = listPages(sc.paths.current).map((p) => p.path);
  if (!pages.length) throw new Error('website has no pages yet');
  const scan = staticScan(sc.paths.current);
  const runtime = await captureRuntime(base, pages, { kind: 'none' }, 'no-consent');
  const prev = db().select().from(schema.privacyInventories).where(eq(schema.privacyInventories.websiteId, websiteId)).orderBy(desc(schema.privacyInventories.version)).limit(1).get();
  const hosting = sc.site.hosting as { provider?: string; location?: string; avvSigned?: 'yes' | 'no' | 'unknown' };
  const inv = assembleInventory({
    scan, runtime, siteDir: sc.paths.current, firstParty: new URL(base).origin, hostingProvider: hosting.provider ?? '', hostingLocation: hosting.location ?? '',
    avvSigned: hosting.avvSigned ?? 'unknown', websiteVersion: sc.site.currentVersion ?? 'unversioned', version: (prev?.version ?? 0) + 1,
  });
  const invId = id('inv_');
  db().transaction((tx) => {
    tx.insert(schema.privacyInventories).values({ id: invId, websiteId, version: inv.version, websiteVersion: inv.websiteVersion, data: inv, createdAt: now() }).run();
    for (const s of inv.services) tx.insert(schema.privacyServices).values({ id: id('psv_'), inventoryId: invId, websiteId, serviceKey: s.id, data: s }).run();
  });
  writeJson(join(sc.paths.root, 'privacy-inventory.json'), inv);
  writeJson(join(sc.paths.qa, 'privacy', 'privacy-inventory.json'), inv);
  writeJson(join(sc.customerRoot, 'legal', 'privacy-inventory.json'), { note: 'Latest inventory per website', websites: { [sc.site.slug]: { version: inv.version, websiteVersion: inv.websiteVersion, generatedAt: inv.generatedAt, services: inv.services.map((s) => ({ id: s.id, status: s.status })) } } });
  return inv;
}

export function latestInventory(websiteId: string): PrivacyInventory | null {
  return (db().select().from(schema.privacyInventories).where(eq(schema.privacyInventories.websiteId, websiteId)).orderBy(desc(schema.privacyInventories.version)).limit(1).get()?.data as PrivacyInventory) ?? null;
}

export { KNOWN_SERVICES };
