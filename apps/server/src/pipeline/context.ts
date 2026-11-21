import { and, eq, inArray } from 'drizzle-orm';
import { join } from 'node:path';
import type { WebsiteBrief, ConceptSpec, DesignSystem } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { customerDir } from '../lib/safePath.ts';
import { readJson } from '../lib/util.ts';
import { requireCustomer } from '../storage/customers.ts';
import { pathsFor, requireWebsite } from '../storage/websites.ts';
import { previewUrl } from '../preview/server.ts';

/** Everything a website-level pipeline step needs, loaded fresh from DB and disk. */
export function siteContext(websiteId: string) {
  const site = requireWebsite(websiteId);
  const customer = requireCustomer(site.customerId);
  const paths = pathsFor(site);
  const cdir = customerDir(customer.slug);
  const latestRun = db().select().from(schema.researchRuns).where(eq(schema.researchRuns.customerId, customer.id)).all().sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const facts = latestRun
    ? db().select().from(schema.researchSources).where(and(eq(schema.researchSources.customerId, customer.id), eq(schema.researchSources.runId, latestRun.id), inArray(schema.researchSources.status, ['VERIFIED', 'LIKELY']))).all()
    : [];
  return {
    site, customer, paths, customerRoot: cdir,
    facts: facts.map((f) => ({ id: f.id, field: f.field, value: f.value, status: f.status, source: f.sourceUrl })),
    research: {
      company: readJson(join(cdir, 'research', 'company.json')),
      competitors: readJson(join(cdir, 'research', 'competitors.json')),
      brand: readJson(join(cdir, 'research', 'brand.json')),
      existingSite: readJson(join(cdir, 'research', 'existing-site.json')),
    },
    brief: site.brief as WebsiteBrief | null,
    concepts: (site.concepts as { concepts: ConceptSpec[] } | null)?.concepts ?? [],
    designSystem: readJson<DesignSystem>(join(paths.root, 'design-system.json')),
    preview: (area = 'current', page = '') => previewUrl(customer.slug, site.slug, area, page),
  };
}
export type SiteContext = ReturnType<typeof siteContext>;
