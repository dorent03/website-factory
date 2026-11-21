import { and, eq } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Functionality, SiteType, type Functionality as Fn } from '@wf/shared';
import { z } from 'zod';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { websiteDir } from '../lib/safePath.ts';
import { slugify, uniqueSlug } from '../lib/slug.ts';
import { id, now, writeJson } from '../lib/util.ts';
import { requireCustomer } from './customers.ts';
import { git } from './git.ts';

export type WebsiteRow = typeof schema.websites.$inferSelect;
export const QA_DIRS = ['visual', 'responsive', 'accessibility', 'seo', 'performance', 'security', 'privacy', 'legal'];

export const Hosting = z.object({
  provider: z.string().max(120).default(''),
  location: z.string().max(120).default(''),
  serverLogs: z.boolean().default(true),
  avvSigned: z.enum(['yes', 'no', 'unknown']).default('unknown'),
  domain: z.string().max(200).default(''),
});
export type Hosting = z.infer<typeof Hosting>;

export function defaultFunctionality(type: string): Fn {
  return {
    contactForm: true,
    map: ['trades', 'local-business', 'restaurant', 'company'].includes(type) ? 'external-link' : 'address-only',
    video: 'none', newsletter: false, booking: false, shop: false, jobApplications: type === 'recruiting',
    userAccounts: false, analytics: 'none', socialEmbeds: false,
  };
}

export const WebsiteCreate = z.object({
  name: z.string().trim().min(1).max(120),
  siteType: SiteType,
  functionality: Functionality.partial().default({}),
  hosting: Hosting.partial().default({}),
});

export interface SitePaths { root: string; current: string; versions: string; qa: string; concepts: string; work: string }

export function sitePaths(customerSlug: string, siteSlug: string): SitePaths {
  const root = websiteDir(customerSlug, siteSlug);
  return { root, current: join(root, 'current'), versions: join(root, 'versions'), qa: join(root, 'qa'), concepts: join(root, 'concepts'), work: join(root, '.work') };
}

export function pathsFor(site: WebsiteRow): SitePaths {
  const c = requireCustomer(site.customerId);
  return sitePaths(c.slug, site.slug);
}

export function listWebsites(customerId?: string): WebsiteRow[] {
  const q = db().select().from(schema.websites);
  return (customerId ? q.where(eq(schema.websites.customerId, customerId)).all() : q.all()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWebsite(websiteId: string): WebsiteRow | null {
  return db().select().from(schema.websites).where(eq(schema.websites.id, websiteId)).get() ?? null;
}

export function requireWebsite(websiteId: string): WebsiteRow {
  const w = getWebsite(websiteId);
  if (!w) throw Object.assign(new Error('website not found'), { statusCode: 404 });
  return w;
}

export function updateWebsite(websiteId: string, patch: Partial<typeof schema.websites.$inferInsert>): WebsiteRow {
  db().update(schema.websites).set({ ...patch, updatedAt: now() }).where(eq(schema.websites.id, websiteId)).run();
  const w = requireWebsite(websiteId);
  writeSiteJson(w);
  return w;
}

export function writeSiteJson(w: WebsiteRow): void {
  const p = pathsFor(w);
  writeJson(join(p.root, 'site.json'), {
    id: w.id, customerId: w.customerId, slug: w.slug, name: w.name, siteType: w.siteType, generator: w.generator, status: w.status,
    functionality: w.functionality, hosting: w.hosting, currentVersion: w.currentVersion, selectedConcept: w.selectedConcept,
    briefApproved: w.briefApproved, staleness: w.staleness, gate: w.gate, updatedAt: w.updatedAt,
  });
}

export async function createWebsite(customerId: string, input: unknown): Promise<WebsiteRow> {
  const c = requireCustomer(customerId);
  const data = WebsiteCreate.parse(input);
  const taken = (s: string) => !!db().select().from(schema.websites).where(and(eq(schema.websites.customerId, customerId), eq(schema.websites.slug, s))).get();
  const slug = uniqueSlug(slugify(data.name, 'website'), taken);
  const p = sitePaths(c.slug, slug);
  if (existsSync(p.current)) throw Object.assign(new Error(`folder already exists: ${p.root}`), { statusCode: 409 });
  for (const d of [p.current, p.versions, p.concepts, p.work, ...QA_DIRS.map((q) => join(p.qa, q))]) mkdirSync(d, { recursive: true });
  await git(p.current, ['init', '-q']);
  writeFileSync(join(p.current, '.gitignore'), '.DS_Store\n');
  await git(p.current, ['add', '-A']);
  await git(p.current, ['commit', '-q', '-m', 'Website Factory: initialize workspace']);
  const t = now();
  const row: typeof schema.websites.$inferInsert = {
    id: id('web_'), customerId, slug, name: data.name, siteType: data.siteType, status: 'draft', generator: 'static-html',
    functionality: { ...defaultFunctionality(data.siteType), ...data.functionality }, hosting: Hosting.parse(data.hosting),
    staleness: { stale: false, reasons: [], since: null }, createdAt: t, updatedAt: t,
  };
  db().insert(schema.websites).values(row).run();
  const w = requireWebsite(row.id!);
  writeSiteJson(w);
  writeJson(join(p.root, 'legal-config.json'), { websiteId: w.id, functionality: w.functionality, hosting: w.hosting, jurisdiction: 'DE', updatedAt: t });
  audit('user', 'website.create', w.id, { customerId, slug });
  return w;
}

export function markStale(websiteId: string, reasons: string[]): void {
  if (!reasons.length) return;
  const w = requireWebsite(websiteId);
  const prev = w.staleness ?? { stale: false, reasons: [], since: null };
  updateWebsite(websiteId, { staleness: { stale: true, reasons: [...new Set([...prev.reasons, ...reasons])].slice(-30), since: prev.since ?? now() } });
}

export function clearStale(websiteId: string): void {
  updateWebsite(websiteId, { staleness: { stale: false, reasons: [], since: null } });
}
