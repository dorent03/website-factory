import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Customer, PrivacyInventory } from '@wf/shared';
import { legalFormSlug } from './rules.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const LEGAL_START = '<!-- wf:legal:start -->';
export const LEGAL_END = '<!-- wf:legal:end -->';

const REP_LABEL: Record<string, string> = {
  gmbh: 'Vertreten durch die Geschäftsführung', ug: 'Vertreten durch die Geschäftsführung', ag: 'Vertreten durch den Vorstand', ev: 'Vertreten durch den Vorstand',
  gbr: 'Vertretungsberechtigte Gesellschafter', egbr: 'Vertretungsberechtigte Gesellschafter', ohg: 'Vertretungsberechtigte Gesellschafter', kg: 'Vertreten durch',
  ek: 'Inhaber/in', einzelunternehmen: 'Inhaber/in',
};

export interface ImprintResult { html: string; missing: string[]; included: string[] }

/**
 * Builds Impressum content strictly from the legal profile. Missing data is never filled in — it is reported and
 * blocks legal approval. Fields are included only where applicable.
 */
export function buildImprint(c: Customer): ImprintResult {
  const l = c.legal;
  const form = legalFormSlug(l.legalForm);
  const missing: string[] = [];
  const included: string[] = [];
  const need = (field: keyof typeof l, value: string) => { if (!value.trim()) missing.push(field as string); else included.push(field as string); return value.trim(); };
  const parts: string[] = [];
  const name = need('legalName', l.legalName);
  const street = need('street', l.street);
  const plz = need('postalCode', l.postalCode);
  const city = need('city', l.city);
  // Sole traders: the legal name is the owner's name; a business designation may precede it.
  const sole = form === 'einzelunternehmen' || form === 'ek';
  const brand = c.marketing.companyName.trim();
  const providerLines = sole && brand && name && brand.toLowerCase() !== name.toLowerCase()
    ? `${esc(brand)}<br>Inhaber: ${esc(name)}<br>${esc(l.legalForm)}`
    : `${esc(name)}${l.legalForm && name && !name.includes(l.legalForm.split(' ')[0]!) ? ` (${esc(l.legalForm)})` : ''}`;
  parts.push(`<section data-wf-imprint="provider"><h2>Angaben gemäß § 5 DDG</h2><p class="wf-address">${providerLines}<br>${esc(street)}<br>${esc(plz)} ${esc(city)}${l.country ? `<br>${esc(l.country)}` : ''}</p></section>`);
  if (sole && l.representatives.length) included.push('representatives');
  else if (form && !['einzelunternehmen'].includes(form) || l.representatives.length) {
    if (!l.representatives.length && form && ['gmbh', 'ug', 'ag', 'ev', 'gbr', 'egbr', 'ohg', 'kg'].includes(form)) missing.push('representatives');
    if (l.representatives.length) { included.push('representatives'); parts.push(`<section data-wf-imprint="representatives"><h2>${REP_LABEL[form ?? ''] ?? 'Vertreten durch'}</h2><p>${l.representatives.map(esc).join('<br>')}</p></section>`); }
  }
  const email = need('email', l.email);
  const contact = [l.phone ? `Telefon: <a href="tel:${esc(l.phone.replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : '', email ? `E-Mail: <a href="mailto:${esc(email)}">${esc(email)}</a>` : ''].filter(Boolean);
  if (l.phone) included.push('phone');
  parts.push(`<section data-wf-imprint="contact"><h2>Kontakt</h2><p>${contact.join('<br>')}</p></section>`);
  const registered = !!l.registerNumber.trim() || (form !== null && ['ek', 'egbr', 'ohg', 'kg', 'gmbh', 'ug', 'ag', 'ev'].includes(form));
  if (registered) {
    const court = need('registerCourt', l.registerCourt);
    const num = need('registerNumber', l.registerNumber);
    const regName = form === 'ev' ? 'Vereinsregister' : form === 'egbr' ? 'Gesellschaftsregister' : 'Handelsregister';
    parts.push(`<section data-wf-imprint="register"><h2>Registereintrag</h2><p>Eintragung im ${regName}.<br>Registergericht: ${esc(court)}<br>Registernummer: ${esc(num)}</p></section>`);
  }
  const tax = [l.vatId ? `Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: ${esc(l.vatId)}` : '', l.economicId ? `Wirtschafts-Identifikationsnummer gemäß § 139c AO: ${esc(l.economicId)}` : ''].filter(Boolean);
  if (l.vatId) included.push('vatId');
  if (l.economicId) included.push('economicId');
  if (tax.length) parts.push(`<section data-wf-imprint="tax"><h2>Steuerangaben</h2><p>${tax.join('<br>')}</p></section>`);
  if (l.supervisoryAuthority) { included.push('supervisoryAuthority'); parts.push(`<section data-wf-imprint="authority"><h2>Zuständige Aufsichtsbehörde</h2><p>${esc(l.supervisoryAuthority)}</p></section>`); }
  if (l.isRegulatedProfession) {
    const prof = [
      l.professionalTitle ? `Berufsbezeichnung: ${esc(l.professionalTitle)}${l.professionalTitleCountry ? ` (verliehen in ${esc(l.professionalTitleCountry)})` : ''}` : '',
      l.chamber ? `Zuständige Kammer: ${esc(l.chamber)}` : '',
      l.professionalRules ? `Berufsrechtliche Regelungen: ${esc(l.professionalRules)}` : '',
    ].filter(Boolean);
    for (const f of ['professionalTitle', 'professionalTitleCountry', 'chamber', 'professionalRules'] as const) (l[f] ? included : missing).push(f);
    parts.push(`<section data-wf-imprint="profession"><h2>Berufsrechtliche Angaben</h2><p>${prof.join('<br>')}</p></section>`);
  } else if (l.chamber) {
    included.push('chamber');
    parts.push(`<section data-wf-imprint="chamber"><h2>Kammerzugehörigkeit</h2><p>${esc(l.chamber)}</p></section>`);
  }
  if (l.hasJournalisticContent) {
    const resp = need('editorialResponsible', l.editorialResponsible);
    parts.push(`<section data-wf-imprint="editorial"><h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>${esc(resp)}</p></section>`);
  }
  return { html: parts.join('\n'), missing: [...new Set(missing)], included: [...new Set(included)] };
}

interface Section { key: string; title: string; body: string }

/** Privacy policy assembled from the inventory: one section per detected processing. Text modules only — final wording needs legal review. */
export function buildPrivacyPolicy(c: Customer, inv: PrivacyInventory, opts: { hostingProvider: string; hostingLocation: string }): { html: string; sections: string[]; uncovered: string[] } {
  const l = c.legal;
  const controller = `${esc(l.legalName || c.marketing.companyName)}<br>${esc(l.street)}<br>${esc(l.postalCode)} ${esc(l.city)}${l.email ? `<br>E-Mail: <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ''}${l.phone ? `<br>Telefon: ${esc(l.phone)}` : ''}`;
  const has = (k: string) => inv.services.some((s) => s.privacySectionKey === k || s.id === k);
  const s: Section[] = [];
  s.push({ key: 'controller', title: 'Verantwortliche Stelle', body: `<p>Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p><p>${controller}</p>` });
  s.push({ key: 'overview', title: 'Allgemeine Hinweise', body: '<p>Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung dieser Website, ihrer Inhalte und Funktionen erforderlich ist oder Sie eingewilligt haben. Nachfolgend informieren wir Sie, welche Daten beim Besuch dieser Website tatsächlich verarbeitet werden.</p>' });
  const hoster = opts.hostingProvider ? esc(opts.hostingProvider) : 'unserem Hosting-Dienstleister';
  s.push({ key: 'hosting', title: 'Hosting und Server-Logfiles', body: `<p>Diese Website wird bei ${hoster}${opts.hostingLocation ? ` (Serverstandort: ${esc(opts.hostingLocation)})` : ''} gehostet. Beim Aufruf der Website übermittelt Ihr Browser automatisch Daten, die in Server-Logfiles gespeichert werden: IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite bzw. Datei, Referrer-URL, verwendeter Browser und Betriebssystem sowie der HTTP-Statuscode.</p><p>Zweck ist die technische Bereitstellung, Stabilität und Sicherheit der Website. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in einer sicheren und funktionsfähigen Website. Der Hoster verarbeitet die Daten als Auftragsverarbeiter (Art. 28 DSGVO). Die Logfiles werden nach Ablauf der beim Hoster eingestellten Speicherfrist gelöscht, sofern sie nicht zur Aufklärung von Sicherheitsvorfällen benötigt werden.</p><p>Die Übertragung erfolgt verschlüsselt per TLS (erkennbar an „https://“ in der Adresszeile).</p>` });
  if (has('contact-form')) {
    const fields = [...new Set(inv.forms.flatMap((f) => f.fields.filter((x) => x.name && x.name !== 'website' && x.name !== 'wf_t').map((x) => `${x.label || x.name}${x.required ? ' (Pflichtfeld)' : ' (freiwillig)'}`)))];
    s.push({ key: 'contact-form', title: 'Kontaktformular', body: `<p>Wenn Sie uns über das Kontaktformular schreiben, verarbeiten wir die von Ihnen eingegebenen Daten${fields.length ? ` (${esc(fields.join(', '))})` : ''} zur Bearbeitung Ihrer Anfrage. Die Nachricht wird per E-Mail über den Server unseres Hosters an uns übermittelt; eine Speicherung der Formularinhalte auf der Website erfolgt nicht.</p><p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit Ihre Anfrage auf einen Vertrag oder vorvertragliche Maßnahmen gerichtet ist, im Übrigen Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen). Wir löschen die Daten, sobald Ihre Anfrage abschließend bearbeitet ist und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>` });
  }
  if (has('email')) s.push({ key: 'email', title: 'Kontakt per E-Mail', body: '<p>Wenn Sie uns per E-Mail kontaktieren, verarbeiten wir Ihre E-Mail-Adresse und die Inhalte Ihrer Nachricht zur Bearbeitung Ihres Anliegens (Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO). Die Daten werden gelöscht, sobald sie für die Bearbeitung nicht mehr erforderlich sind und keine Aufbewahrungspflichten bestehen.</p>' });
  if (has('fonts-self-hosted')) s.push({ key: 'fonts-self-hosted', title: 'Schriftarten', body: '<p>Diese Website verwendet Schriftarten, die lokal auf unserem Server gespeichert sind. Beim Laden der Seite wird keine Verbindung zu Servern Dritter (z. B. Google oder Adobe) hergestellt.</p>' });
  if (has('consent-tool') || inv.consentRequired) s.push({ key: 'consent-tool', title: 'Einwilligungsverwaltung', body: `<p>Für Inhalte, die eine Einwilligung erfordern, speichern wir Ihre Auswahl im lokalen Speicher Ihres Browsers (localStorage, Schlüssel „${esc(inv.services.find((x) => x.id === 'consent-tool')?.localStorage[0] ?? 'wf-consent')}“). Diese Speicherung ist technisch erforderlich, um Ihre Entscheidung zu respektieren (§ 25 Abs. 2 Nr. 2 TDDDG, Art. 6 Abs. 1 lit. c DSGVO i. V. m. Art. 7 Abs. 1 DSGVO). Die Einwilligungsverwaltung wird von uns selbst betrieben; es werden keine Daten an Dritte übermittelt. Sie können Ihre Auswahl jederzeit über den Link „Cookie-Einstellungen“ im Fußbereich ändern oder widerrufen.</p>` });
  const media: Record<string, [string, string]> = {
    youtube: ['YouTube', 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland (Muttergesellschaft: Google LLC, USA)'],
    vimeo: ['Vimeo', 'Vimeo.com, Inc., 330 West 34th Street, New York, NY 10001, USA'],
    'google-maps': ['Google Maps', 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland (Muttergesellschaft: Google LLC, USA)'],
    openstreetmap: ['OpenStreetMap', 'OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Vereinigtes Königreich'],
  };
  for (const [key, [name, provider]] of Object.entries(media)) {
    if (!has(key)) continue;
    s.push({ key, title: name, body: `<p>Auf dieser Website sind Inhalte von ${name} eingebunden. Anbieter ist ${esc(provider)}. Die Inhalte werden erst geladen, nachdem Sie dem ausdrücklich zugestimmt haben (Klick auf „Inhalt laden“ bzw. Einwilligung in die Kategorie „Externe Medien“). Vorher wird keine Verbindung zu ${name} hergestellt.</p><p>Nach Ihrer Einwilligung werden u. a. Ihre IP-Adresse, Geräte- und Browserinformationen sowie Nutzungsdaten an den Anbieter übermittelt; der Anbieter kann Cookies oder vergleichbare Technologien einsetzen. Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG), die Sie jederzeit mit Wirkung für die Zukunft über „Cookie-Einstellungen“ widerrufen können.${/USA/.test(provider) ? ' Eine Übermittlung in die USA ist möglich; der Anbieter ist nach dem EU-US Data Privacy Framework zertifiziert bzw. stützt sich auf Standardvertragsklauseln — Details siehe Datenschutzhinweise des Anbieters.' : ''}</p>` });
  }
  s.push({ key: 'rights', title: 'Ihre Rechte', body: '<p>Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21). Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).</p><p>Sie haben zudem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), insbesondere in dem Bundesland Ihres Wohnorts oder unseres Sitzes.</p>' });
  s.push({ key: 'changes', title: 'Aktualität', body: `<p>Diese Datenschutzerklärung beschreibt den Stand der Website zum ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}. Wir passen sie an, wenn sich die Funktionen der Website ändern.</p>` });
  const html = s.map((x) => `<section data-wf-section="${x.key}"><h2>${x.title}</h2>${x.body}</section>`).join('\n');
  const covered = new Set(s.map((x) => x.key));
  const uncovered = inv.services.filter((x) => x.privacySectionKey && !covered.has(x.privacySectionKey) && x.id !== 'hosting').map((x) => x.service);
  return { html, sections: [...covered], uncovered };
}

/** Puts generated legal content into the page between markers (or into <main> on first run). Keeps the agent-built layout. */
export function injectLegalContent(file: string, heading: string, content: string): void {
  let html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const block = `${LEGAL_START}\n<div class="wf-legal">\n<h1>${heading}</h1>\n${content}\n</div>\n${LEGAL_END}`;
  if (html.includes(LEGAL_START) && html.includes(LEGAL_END)) html = html.replace(new RegExp(`${LEGAL_START}[\\s\\S]*?${LEGAL_END}`), block);
  else if (/<main\b[^>]*>[\s\S]*<\/main>/i.test(html)) html = html.replace(/(<main\b[^>]*>)[\s\S]*(<\/main>)/i, `$1\n${block}\n$2`);
  else throw new Error(`${file} has no <main> element or legal markers`);
  writeFileSync(file, html);
}

export function jsonLd(c: Customer, siteType: string, domain: string): Record<string, unknown> {
  const l = c.legal;
  const m = c.marketing;
  const local = ['trades', 'local-business', 'restaurant', 'company', 'professional-services', 'consulting'].includes(siteType);
  const type = siteType === 'restaurant' ? 'Restaurant' : siteType === 'professional-services' || siteType === 'consulting' ? 'ProfessionalService' : local ? 'LocalBusiness' : 'Organization';
  const data: Record<string, unknown> = { '@context': 'https://schema.org', '@type': type, name: m.companyName };
  if (l.legalName) data.legalName = l.legalName;
  if (domain) data.url = domain;
  if (l.street && l.postalCode && l.city) data.address = { '@type': 'PostalAddress', streetAddress: l.street, postalCode: l.postalCode, addressLocality: l.city, addressCountry: 'DE' };
  if (m.phone || l.phone) data.telephone = m.phone || l.phone;
  if (m.email || l.email) data.email = m.email || l.email;
  if (local && m.openingHours) data.openingHours = m.openingHours;
  if (l.vatId) data.vatID = l.vatId;
  return data;
}

export function injectJsonLd(file: string, data: Record<string, unknown>): void {
  let html = readFileSync(file, 'utf8');
  const tag = `<script type="application/ld+json" data-wf="org">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  html = html.replace(/<script type="application\/ld\+json" data-wf="org">[\s\S]*?<\/script>\s*/g, '');
  html = html.replace('</head>', `${tag}\n</head>`);
  writeFileSync(file, html);
}
