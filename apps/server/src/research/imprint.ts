/**
 * Deterministic extraction of Impressum candidates. Results are candidates with provenance,
 * never final truth — verification and the user decide.
 */
export interface Candidate { field: string; value: string; quote: string; confidence: number }

const LEGAL_FORMS: Array<[RegExp, string]> = [
  [/\bGmbH\s*&\s*Co\.?\s*KG\b/, 'GmbH & Co. KG'], [/\bUG\s*\(haftungsbeschränkt\)/i, 'UG (haftungsbeschränkt)'], [/\bgGmbH\b/, 'GmbH'],
  [/\bGmbH\b/, 'GmbH'], [/\bAG\b/, 'AG'], [/\bPartG\s*mbB\b/, 'PartG mbB'], [/\bOHG\b/, 'OHG'], [/\bKG\b/, 'KG'], [/\be\.\s?K\.|\beingetragene[rs]? Kauf(mann|frau)/i, 'e.K.'],
  [/\bGbR\b/, 'GbR'], [/\be\.\s?V\./, 'e.V.'],
];

const around = (text: string, idx: number, len = 140) => text.slice(Math.max(0, idx - 40), idx + len).replace(/\s+/g, ' ').trim();

export function extractImprintCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (field: string, value: string, idx: number, confidence = 0.8) => {
    const v = value.replace(/\s+/g, ' ').trim();
    if (v && !out.some((c) => c.field === field && c.value === v)) out.push({ field, value: v, quote: around(text, idx), confidence });
  };
  for (const m of text.matchAll(/\b(HR[AB])\s*[-:.]?\s*(\d{2,7}(?:\s?[A-Z]{1,2})?)\b/g)) push('registerNumber', `${m[1]} ${m[2]}`, m.index!);
  for (const m of text.matchAll(/\b(Amtsgericht|Registergericht:?\s*(?:Amtsgericht)?)\s+([A-ZÄÖÜ][\wäöüß.-]+(?:\s(?:am|an der|im|in der)\s[A-ZÄÖÜ][\wäöüß-]+|\s\([^)]{2,30}\))?)/g)) {
    push('registerCourt', `Amtsgericht ${m[2]!.replace(/[.,;]$/, '')}`, m.index!);
  }
  for (const m of text.matchAll(/\b(DE\s?\d{3}\s?\d{3}\s?\d{3})\b/g)) push('vatId', m[1]!.replace(/\s/g, ''), m.index!);
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) if (!/\.(png|jpe?g|svg|webp)$/i.test(m[0])) push('email', m[0].toLowerCase(), m.index!, 0.75);
  for (const m of text.matchAll(/(?:Tel(?:efon)?\.?|Fon|Phone)\s*[:.]?\s*(\+?[\d][\d\s()/–-]{6,22}\d)/gi)) push('phone', m[1]!.replace(/\s+/g, ' '), m.index!, 0.75);
  const L = 'A-Za-zÄÖÜäöüß';
  const streetRe = new RegExp(`([A-ZÄÖÜ][${L}.-]*(?:[ -][${L}.-]+){0,3}?(?:str\\.|straße|strasse|weg|platz|allee|gasse|ring|damm|ufer|steige|berg|hof|park|markt|graben|chaussee)\\s?\\d{1,4}\\s?[a-zA-Z]?(?:[-–/]\\d{1,4})?)\\s*,?\\s*\\n?\\s*(?:D-)?(\\d{5})\\s+([A-ZÄÖÜ][${L}-]+(?:\\s(?:am|an der|im|in|bei|ob der)\\s[A-ZÄÖÜ][${L}-]+)?)`, 'g');
  for (const m of text.matchAll(streetRe)) {
    push('street', m[1]!, m.index!, 0.75);
    push('postalCode', m[2]!, m.index!, 0.75);
    push('city', m[3]!, m.index!, 0.75);
  }
  for (const m of text.matchAll(/(?:Geschäftsführer(?:in)?|Geschäftsführung|Vertreten durch|Vertretungsberechtigte[rn]?|Inhaber(?:in)?|Vorstand)[ \t]*[:.]?[ \t]*([A-ZÄÖÜ][\wäöüß.-]+(?:[ \t][A-ZÄÖÜ][\wäöüß.-]+){1,3}(?:[ \t]*(?:,|und|&)[ \t]*[A-ZÄÖÜ][\wäöüß.-]+(?:[ \t][A-ZÄÖÜ][\wäöüß.-]+){1,3})*)/g)) {
    for (const name of m[1]!.split(/\s*(?:,|\bund\b|&)\s*/)) if (name.split(' ').length >= 2 && name.length < 60) push('representatives', name, m.index!, 0.75);
  }
  for (const [re, form] of LEGAL_FORMS) {
    const m = text.match(re);
    if (m) { push('legalForm', form, m.index!, 0.7); break; }
  }
  // Legal name: the line containing the legal form near the top of the imprint.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 40);
  const nameLine = lines.find((l) => l.length < 90 && LEGAL_FORMS.some(([re]) => re.test(l)) && !/registergericht|amtsgericht|handelsregister/i.test(l));
  if (nameLine) push('legalName', nameLine.replace(/^(Angaben gemäß.*?:|Impressum:?|Betreiber:?)/i, '').trim(), text.indexOf(nameLine), 0.7);
  return out;
}

export function findLegalLinks(links: Array<{ href: string; text: string }>, origin: string): { imprint: string | null; privacy: string | null; contact: string | null } {
  const same = links.filter((l) => { try { return new URL(l.href).origin === origin; } catch { return false; } });
  const pick = (re: RegExp) => same.find((l) => re.test(l.text) || re.test(new URL(l.href).pathname))?.href ?? null;
  return { imprint: pick(/impressum|imprint|legal[-_ ]?notice/i), privacy: pick(/datenschutz|privacy/i), contact: pick(/kontakt|contact/i) };
}
