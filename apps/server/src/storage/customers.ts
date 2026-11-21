import { eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CustomerInput, LegalProfile, MarketingProfile, type Customer } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { customerDir } from '../lib/safePath.ts';
import { slugify, uniqueSlug } from '../lib/slug.ts';
import { id, now, writeJson } from '../lib/util.ts';

function load(row: typeof schema.customers.$inferSelect): Customer {
  const legalRow = db().select().from(schema.customerLegalProfiles).where(eq(schema.customerLegalProfiles.customerId, row.id)).get();
  return {
    id: row.id, slug: row.slug, createdAt: row.createdAt, updatedAt: row.updatedAt,
    marketing: MarketingProfile.parse(row.marketing),
    legal: LegalProfile.parse(legalRow?.data ?? {}),
  };
}

export function listCustomers(): Customer[] {
  return db().select().from(schema.customers).all().map(load).sort((a, b) => a.marketing.companyName.localeCompare(b.marketing.companyName));
}

export function getCustomer(customerId: string): Customer | null {
  const row = db().select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();
  return row ? load(row) : null;
}

export function requireCustomer(customerId: string): Customer {
  const c = getCustomer(customerId);
  if (!c) throw Object.assign(new Error('customer not found'), { statusCode: 404 });
  return c;
}

/** Mirrors the DB state into the customer folder so agents and humans can read it. */
export function writeCustomerFiles(c: Customer): void {
  const dir = customerDir(c.slug);
  for (const sub of ['research/assets', 'legal', 'sites']) mkdirSync(join(dir, sub), { recursive: true });
  writeJson(join(dir, 'customer.json'), { id: c.id, slug: c.slug, createdAt: c.createdAt, updatedAt: c.updatedAt, marketing: c.marketing });
  writeJson(join(dir, 'legal', 'company-legal-data.json'), { customerId: c.id, updatedAt: c.updatedAt, legal: c.legal });
}

export function createCustomer(input: unknown): Customer {
  const data = CustomerInput.parse(input);
  const taken = (s: string) => !!db().select().from(schema.customers).where(eq(schema.customers.slug, s)).get();
  const slug = uniqueSlug(slugify(data.marketing.companyName, 'kunde'), taken);
  const c: Customer = { id: id('cus_'), slug, createdAt: now(), updatedAt: now(), ...data };
  db().transaction((tx) => {
    tx.insert(schema.customers).values({ id: c.id, slug, marketing: c.marketing, createdAt: c.createdAt, updatedAt: c.updatedAt }).run();
    tx.insert(schema.customerLegalProfiles).values({ customerId: c.id, data: c.legal, updatedAt: c.updatedAt }).run();
  });
  writeCustomerFiles(c);
  audit('user', 'customer.create', c.id, { slug });
  return c;
}

export function updateCustomer(customerId: string, patch: { marketing?: unknown; legal?: unknown }): Customer {
  const c = requireCustomer(customerId);
  const marketing = patch.marketing ? MarketingProfile.parse({ ...c.marketing, ...(patch.marketing as object) }) : c.marketing;
  const legal = patch.legal ? LegalProfile.parse({ ...c.legal, ...(patch.legal as object) }) : c.legal;
  const t = now();
  db().transaction((tx) => {
    tx.update(schema.customers).set({ marketing, updatedAt: t }).where(eq(schema.customers.id, customerId)).run();
    tx.insert(schema.customerLegalProfiles).values({ customerId, data: legal, updatedAt: t })
      .onConflictDoUpdate({ target: schema.customerLegalProfiles.customerId, set: { data: legal, updatedAt: t } }).run();
  });
  const next = { ...c, marketing, legal, updatedAt: t };
  writeCustomerFiles(next);
  audit('user', 'customer.update', customerId, { legalChanged: !!patch.legal, marketingChanged: !!patch.marketing });
  return next;
}

export function deleteCustomer(customerId: string): void {
  // Database record only. Files on disk are kept deliberately — deleting customer work is a manual decision.
  db().delete(schema.customers).where(eq(schema.customers.id, customerId)).run();
  audit('user', 'customer.delete', customerId);
}
