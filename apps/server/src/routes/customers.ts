import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { createCustomer, deleteCustomer, listCustomers, requireCustomer, updateCustomer } from '../storage/customers.ts';
import { listWebsites } from '../storage/websites.ts';
import { z } from 'zod';
import { createJob } from '../orchestrator/jobs.ts';
import { startResearchRun, researchFile } from '../research/pipeline.ts';
import { applyFacts } from '../research/apply.ts';
import { readJson } from '../lib/util.ts';

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/customers', async () => {
    const sites = listWebsites();
    return { customers: listCustomers().map((c) => ({ ...c, websiteCount: sites.filter((s) => s.customerId === c.id).length })) };
  });
  app.post('/api/customers', async (req, reply) => reply.code(201).send({ customer: createCustomer(req.body) }));
  app.get('/api/customers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const customer = requireCustomer(id);
    const runs = db().select().from(schema.researchRuns).where(eq(schema.researchRuns.customerId, id)).orderBy(desc(schema.researchRuns.startedAt)).all();
    const facts = db().select().from(schema.researchSources).where(eq(schema.researchSources.customerId, id)).all();
    return { customer, websites: listWebsites(id), researchRuns: runs, facts };
  });
  app.post('/api/customers/:id/research', async (req, reply) => {
    const c = requireCustomer((req.params as { id: string }).id);
    const runId = startResearchRun(c.id);
    const job = createJob('research', { customerId: c.id, title: `Research · ${c.marketing.companyName}`, input: { runId } });
    return reply.code(202).send({ job, runId });
  });
  app.get('/api/customers/:id/research', async (req) => {
    const c = requireCustomer((req.params as { id: string }).id);
    const f = (n: string) => readJson(researchFile(c.slug, n));
    return { company: f('company.json'), competitors: f('competitors.json'), brand: f('brand.json'), existingSite: f('existing-site.json'), suspicious: f('suspicious-content.json') };
  });
  app.post('/api/customers/:id/facts/apply', async (req) => {
    const body = z.object({ factIds: z.array(z.string()).min(1).max(200), target: z.enum(['marketing', 'legal', 'both']).default('both') }).parse(req.body);
    return applyFacts((req.params as { id: string }).id, body.factIds, body.target);
  });
  app.patch('/api/customers/:id', async (req) => ({ customer: updateCustomer((req.params as { id: string }).id, req.body as object) }));
  app.delete('/api/customers/:id', async (req) => { deleteCustomer((req.params as { id: string }).id); return { ok: true }; });
}
