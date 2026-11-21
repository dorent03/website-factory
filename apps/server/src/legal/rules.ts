import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LegalRule, type Functionality, type LegalProfile, type PrivacyInventory } from '@wf/shared';
import { LEGAL_RULES_DIR } from '../config.ts';

export interface LoadedRuleset { rules: LegalRule[]; version: string; errors: string[]; sections: DatenschutzCatalog | null }
export interface DatenschutzCatalog { sections: Array<{ key: string; title: string; requiredTopics: string[]; consentRequiredUnderTDDDG25: string; lawyerReview: string | null }> }

let cache: { at: number; set: LoadedRuleset } | null = null;

/** Loads legal-rules/**\/*.json (except catalogs). Invalid rule files are reported, never silently ignored. */
export function loadRuleset(): LoadedRuleset {
  if (cache && Date.now() - cache.at < 10_000) return cache.set;
  const rules: LegalRule[] = [];
  const errors: string[] = [];
  const hash = createHash('sha256');
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!n.endsWith('.json') || n === 'sources.json' || n === 'datenschutz-sections.json') continue;
      const raw = readFileSync(p, 'utf8');
      hash.update(raw);
      try {
        const r = LegalRule.safeParse(JSON.parse(raw));
        if (r.success) rules.push(r.data); else errors.push(`${relative(LEGAL_RULES_DIR, p)}: ${r.error.issues[0]?.message}`);
      } catch (e) { errors.push(`${relative(LEGAL_RULES_DIR, p)}: ${(e as Error).message}`); }
    }
  };
  walk(LEGAL_RULES_DIR);
  const catPath = join(LEGAL_RULES_DIR, 'germany', 'datenschutz-sections.json');
  const sections = existsSync(catPath) ? (JSON.parse(readFileSync(catPath, 'utf8')) as DatenschutzCatalog) : null;
  const reviewed = rules.map((r) => r.lastReviewed).sort().at(-1) ?? 'none';
  const set = { rules, errors, sections, version: `germany@${reviewed}+${rules.length}r#${hash.digest('hex').slice(0, 8)}` };
  cache = { at: Date.now(), set };
  return set;
}

const FORM_MAP: Record<string, string> = {
  Einzelunternehmen: 'einzelunternehmen', Freiberufler: 'einzelunternehmen', 'e.K.': 'ek', GbR: 'gbr', OHG: 'ohg', KG: 'kg', 'GmbH & Co. KG': 'kg',
  GmbH: 'gmbh', 'UG (haftungsbeschränkt)': 'ug', AG: 'ag', 'e.V.': 'ev',
};
const REGISTERED = new Set(['ek', 'egbr', 'ohg', 'kg', 'gmbh', 'ug', 'ag', 'ev']);

export function legalFormSlug(form: string): string | null {
  return FORM_MAP[form] ?? null;
}

export interface Facts { legal: LegalProfile; functionality: Functionality; inventory: PrivacyInventory | null; siteType: string }

export function conditions(f: Facts): Record<string, boolean> {
  const form = legalFormSlug(f.legal.legalForm);
  const media = f.inventory?.services.some((s) => s.category === 'external-media' || s.category === 'maps' || s.category === 'social') ?? (f.functionality.video === 'youtube' || f.functionality.video === 'vimeo' || f.functionality.map === 'embed');
  return {
    isCommercial: f.legal.isCommercial,
    hasJournalisticContent: f.legal.hasJournalisticContent,
    isRegulatedProfession: f.legal.isRegulatedProfession,
    hasRegisterEntry: !!f.legal.registerNumber.trim() || (form !== null && REGISTERED.has(form)),
    hasVatId: !!f.legal.vatId.trim(),
    sellsToConsumers: f.legal.sellsToConsumers,
    hasContactForm: (f.inventory?.forms.length ?? 0) > 0 || f.functionality.contactForm,
    hasNewsletter: f.functionality.newsletter,
    hasShop: f.functionality.shop,
    hasBooking: f.functionality.booking,
    hasJobApplications: f.functionality.jobApplications,
    hasUserAccounts: f.functionality.userAccounts,
    usesNonEssentialStorage: f.inventory?.consentRequired ?? false,
    embedsThirdPartyMedia: media,
  };
}

export function applies(rule: LegalRule, f: Facts, cond: Record<string, boolean>): boolean {
  const w = rule.appliesWhen;
  if (w.siteTypes.length && !w.siteTypes.includes(f.siteType)) return false;
  if (w.legalForms.length) {
    const form = legalFormSlug(f.legal.legalForm);
    if (!form || !w.legalForms.includes(form)) return false;
  }
  if (w.modules.length && !w.modules.some((m) => cond[`has${m[0]!.toUpperCase()}${m.slice(1)}`])) return false;
  return w.conditions.every((c) => cond[c] === true);
}
