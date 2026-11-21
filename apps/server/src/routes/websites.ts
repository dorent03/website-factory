import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.ts';
import { requireCustomer } from '../storage/customers.ts';
import { createWebsite, listWebsites, pathsFor, requireWebsite, updateWebsite, Hosting } from '../storage/websites.ts';
import { diffVersions, listVersions, restoreVersion } from '../storage/versions.ts';
import { previewUrl } from '../preview/server.ts';
import { Functionality } from '@wf/shared';
import { listPages } from '../pipeline/pages.ts';

export function websiteSummary(id: string) {
  const w = requireWebsite(id);
  const c = requireCustomer(w.customerId);
  const latest = <T>(table: T & { websiteId: unknown; createdAt: unknown }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db().select().from(table as any).where(eq((table as any).websiteId, id)).orderBy(desc((table as any).createdAt)).limit(1).get() as { data: unknown } | undefined;
  const p = pathsFor(w);
  return {
    website: w,
    customer: { id: c.id, slug: c.slug, companyName: c.marketing.companyName },
    paths: p,
    previewBase: previewUrl(c.slug, w.slug, 'current'),
    pages: listPages(p.current),
    qa: latest(schema.qaReports)?.data ?? null,
    legalAudit: latest(schema.legalAudits)?.data ?? null,
    inventory: latest(schema.privacyInventories)?.data ?? null,
    consent: latest(schema.consentConfigurations) ?? null,
    designSystem: latest(schema.designSystems)?.data ?? null,
    versions: listVersions(id),
  };
}

export async function websiteRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/websites', async () => {
    const all = listWebsites();
    const names = new Map<string, string>();
    return {
      websites: all.map((w) => {
        if (!names.has(w.customerId)) names.set(w.customerId, requireCustomer(w.customerId).marketing.companyName);
        return { ...w, customerName: names.get(w.customerId) };
      }),
    };
  });
  app.get('/api/overview', async () => {
    let qaFailures = 0, legalWarnings = 0, manualReview = 0;
    const sites = listWebsites().map((w) => {
      const s = websiteSummary(w.id);
      const qa = s.qa as { sections?: Array<{ status: string }> } | null;
      const la = s.legalAudit as { sections?: Array<{ status: string }>; manualReview?: string[] } | null;
      qaFailures += qa?.sections?.filter((x) => x.status === 'FAIL').length ?? 0;
      legalWarnings += la?.sections?.filter((x) => x.status === 'WARNING' || x.status === 'FAIL').length ?? 0;
      manualReview += la?.manualReview?.length ?? 0;
      const gate = w.gate as { state?: string; reasons?: Array<{ message: string }> } | null;
      return { id: w.id, name: w.name, customerName: s.customer.companyName, gate: gate?.state ?? null, gateReasons: gate?.reasons?.map((r) => r.message) ?? [], updatedAt: w.updatedAt };
    });
    return { qaFailures, legalWarnings, manualReview, sites };
  });
  app.post('/api/customers/:id/websites', async (req, reply) => reply.code(201).send({ website: await createWebsite((req.params as { id: string }).id, req.body) }));
  app.get('/api/websites/:id', async (req) => websiteSummary((req.params as { id: string }).id));
  app.patch('/api/websites/:id', async (req) => {
    const body = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      functionality: Functionality.partial().optional(),
      hosting: Hosting.partial().optional(),
      briefApproved: z.boolean().optional(),
      selectedConcept: z.enum(['A', 'B', 'C']).optional(),
    }).parse(req.body);
    const w = requireWebsite((req.params as { id: string }).id);
    return {
      website: updateWebsite(w.id, {
        ...(body.name ? { name: body.name } : {}),
        ...(body.functionality ? { functionality: { ...w.functionality, ...body.functionality } } : {}),
        ...(body.hosting ? { hosting: Hosting.parse({ ...w.hosting, ...body.hosting }) } : {}),
        ...(body.briefApproved !== undefined ? { briefApproved: body.briefApproved } : {}),
        ...(body.selectedConcept ? { selectedConcept: body.selectedConcept } : {}),
      }),
    };
  });
  app.get('/api/websites/:id/versions', async (req) => ({ versions: listVersions((req.params as { id: string }).id) }));
  app.get('/api/websites/:id/diff', async (req) => {
    const q = z.object({ from: z.string(), to: z.string() }).parse(req.query);
    return diffVersions((req.params as { id: string }).id, q.from, q.to);
  });
  app.post('/api/websites/:id/versions/:versionId/restore', async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    return { version: await restoreVersion(id, versionId) };
  });
}
