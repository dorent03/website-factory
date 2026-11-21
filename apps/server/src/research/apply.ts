import { inArray } from 'drizzle-orm';
import type { FactStatus } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { requireCustomer, updateCustomer } from '../storage/customers.ts';

const LEGAL_MAP: Record<string, string> = { legalName: 'legalName', legalForm: 'legalForm', street: 'street', postalCode: 'postalCode', city: 'city', email: 'email', phone: 'phone', registerCourt: 'registerCourt', registerNumber: 'registerNumber', vatId: 'vatId' };
const MARKETING_MAP: Record<string, string> = { companyName: 'companyName', phone: 'phone', email: 'email', website: 'website', openingHours: 'openingHours', serviceArea: 'serviceArea', industry: 'industry' };
const ADDRESS = new Set(['street', 'postalCode', 'city']);

/**
 * Applies user-selected facts to the customer profile. Selecting is the user's confirmation.
 * Conflicts are never applied; legal fields keep a verification trail pointing to the source facts.
 */
export function applyFacts(customerId: string, factIds: string[], target: 'marketing' | 'legal' | 'both' = 'both'): { applied: string[]; skipped: string[] } {
  const c = requireCustomer(customerId);
  const facts = db().select().from(schema.researchSources).where(inArray(schema.researchSources.id, factIds)).all().filter((f) => f.customerId === customerId);
  const marketing: Record<string, unknown> = { ...c.marketing, address: { ...c.marketing.address } };
  const legal: Record<string, unknown> = { ...c.legal };
  const verification = [...c.legal.verification];
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const f of facts) {
    if (f.status === 'CONFLICT') { skipped.push(`${f.field}: conflict must be resolved manually`); continue; }
    if (target !== 'legal') {
      if (MARKETING_MAP[f.field]) { marketing[MARKETING_MAP[f.field]!] = f.value; applied.push(`marketing.${f.field}`); }
      if (ADDRESS.has(f.field)) { (marketing.address as Record<string, string>)[f.field] = f.value; applied.push(`marketing.address.${f.field}`); }
      if (f.field === 'services' && !(marketing.services as string[]).includes(f.value)) { (marketing.services as string[]).push(f.value); applied.push('marketing.services'); }
    }
    if (target !== 'marketing') {
      if (LEGAL_MAP[f.field]) { legal[LEGAL_MAP[f.field]!] = f.value; applied.push(`legal.${f.field}`); }
      if (f.field === 'representatives' && !(legal.representatives as string[]).includes(f.value)) { legal.representatives = [...(legal.representatives as string[]), f.value]; applied.push('legal.representatives'); }
      if (LEGAL_MAP[f.field] || f.field === 'representatives') {
        const i = verification.findIndex((v) => v.field === f.field);
        const entry = { field: f.field, status: f.status as FactStatus, factIds: [f.id], confirmedByUser: true };
        if (i >= 0) verification[i] = entry; else verification.push(entry);
      }
    }
  }
  legal.verification = verification;
  updateCustomer(customerId, { marketing, legal });
  audit('user', 'research.apply', customerId, { applied, skipped });
  return { applied: [...new Set(applied)], skipped };
}
