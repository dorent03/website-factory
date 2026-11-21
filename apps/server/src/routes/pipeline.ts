import type { FastifyInstance } from 'fastify';
import { ZipArchive } from 'archiver';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { JOB_KINDS, WebsiteBrief, AgentId } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { safeJoin } from '../lib/safePath.ts';
import { id, now, readJson } from '../lib/util.ts';
import { createJob, listJobs } from '../orchestrator/jobs.ts';
import { getSettings } from '../lib/settings.ts';
import { chatHistory, startEdit } from '../pipeline/editor.ts';
import { classifyEdit } from '../pipeline/routing.ts';
import { importSite } from '../pipeline/importer.ts';
import { validateBrief } from '../pipeline/brief.ts';
import { siteContext } from '../pipeline/context.ts';
import { signOff, evaluateGate } from '../legal/gate.ts';
import { loadRuleset } from '../legal/rules.ts';
import { auditToText } from '../legal/audit.ts';
import { requireCustomer } from '../storage/customers.ts';
import { customerDir } from '../lib/safePath.ts';
import { pathsFor, requireWebsite, updateWebsite } from '../storage/websites.ts';
import { latestVersion } from '../storage/versions.ts';
import { slugify } from '../lib/slug.ts';

const TITLES: Record<string, string> = {
  brief: 'Website brief', concepts: 'Design concepts', build: 'Build & full QA pipeline', 'visual-review': 'Claude visual review', 'technical-qa': 'Codex technical QA',
  qa: 'Full QA', privacy: 'Privacy & consent audit', legal: 'Legal audit', edit: 'AI edit', import: 'Import analysis', research: 'Research',
};

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/websites/:id/jobs', async (req, reply) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const body = z.object({ kind: z.enum(JOB_KINDS), agentOverrides: z.record(z.string(), AgentId).optional() }).parse(req.body);
    if (['research', 'edit', 'import'].includes(body.kind)) return reply.code(400).send({ error: `${body.kind} is started from its own endpoint` });
    const c = requireCustomer(w.customerId);
    const job = createJob(body.kind, { customerId: c.id, websiteId: w.id, title: `${TITLES[body.kind] ?? body.kind} · ${c.marketing.companyName} · ${w.name}`, input: { agentOverrides: body.agentOverrides ?? {} } });
    return reply.code(202).send({ job });
  });

  app.put('/api/websites/:id/brief', async (req) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const brief = WebsiteBrief.parse((req.body as { brief: unknown }).brief);
    const sc = siteContext(w.id);
    const issues = validateBrief(brief, new Set(sc.facts.map((f) => f.id)));
    updateWebsite(w.id, { brief, briefApproved: false });
    return { issues };
  });

  app.post('/api/websites/:id/brief/approve', async (req) => {
    const w = requireWebsite((req.params as { id: string }).id);
    if (!w.brief) throw Object.assign(new Error('no brief to approve'), { statusCode: 400 });
    audit('user', 'brief.approve', w.id);
    return { website: updateWebsite(w.id, { briefApproved: true }) };
  });

  app.post('/api/websites/:id/concept', async (req) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const { concept } = z.object({ concept: z.enum(['A', 'B', 'C']) }).parse(req.body);
    const list = (w.concepts as { concepts?: Array<{ id: string }> } | null)?.concepts ?? [];
    if (!list.some((c) => c.id === concept)) throw Object.assign(new Error(`concept ${concept} does not exist`), { statusCode: 400 });
    audit('user', 'concept.select', w.id, { concept });
    const website = updateWebsite(w.id, { selectedConcept: concept });
    const running = listJobs(50).some((j) => j.websiteId === w.id && j.kind === 'build' && !['complete', 'failed', 'cancelled', 'manual-review', 'waiting-for-agent'].includes(j.state));
    if (getSettings().autoAdvance && !running && !w.currentVersion) {
      const c = requireCustomer(w.customerId);
      const job = createJob('build', { customerId: c.id, websiteId: w.id, title: `${TITLES.build} · ${c.marketing.companyName} · ${w.name}` });
      return { website, job };
    }
    return { website, job: null };
  });

  app.get('/api/websites/:id/chat', async (req) => ({ messages: chatHistory((req.params as { id: string }).id) }));
  app.post('/api/websites/:id/chat/route', async (req) => ({ route: classifyEdit(z.object({ message: z.string().min(1).max(4000) }).parse(req.body).message) }));
  app.post('/api/websites/:id/chat', async (req, reply) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const body = z.object({
      message: z.string().trim().min(2).max(4000),
      agent: z.enum(['auto', 'claude', 'codex']).default('auto'),
      annotations: z.array(z.object({ selector: z.string().max(400), html: z.string().max(800), text: z.string().max(200).default(''), page: z.string().max(200), note: z.string().max(1000) })).max(20).default([]),
    }).parse(req.body);
    if (!latestVersion(w.id)) return reply.code(400).send({ error: 'The website has no version yet — build it first.' });
    const { route } = startEdit(w.id, body.message, body.agent, body.annotations);
    const c = requireCustomer(w.customerId);
    const job = createJob('edit', { customerId: c.id, websiteId: w.id, title: `AI edit · ${w.name}: ${body.message.slice(0, 60)}`, input: { message: body.message, mode: body.agent, route, annotations: body.annotations } });
    return reply.code(202).send({ job, route });
  });

  app.post('/api/websites/:id/signoff', async (req) => {
    const body = z.object({ by: z.string().trim().min(2).max(80), note: z.string().max(1000).default(''), confirmManualReview: z.literal(true) }).parse(req.body);
    return { gate: signOff((req.params as { id: string }).id, body.by, body.note) };
  });
  app.post('/api/websites/:id/gate', async (req) => ({ gate: evaluateGate((req.params as { id: string }).id) }));

  app.get('/api/websites/:id/legal-report', async (req, reply) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const row = db().select().from(schema.legalAudits).where(eq(schema.legalAudits.websiteId, w.id)).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!row) return reply.code(404).send({ error: 'no legal audit yet' });
    return reply.type('text/plain; charset=utf-8').send(auditToText(row.data as never));
  });
  app.get('/api/websites/:id/legal-documents', async (req) => ({ documents: db().select({ id: schema.legalDocuments.id, kind: schema.legalDocuments.kind, version: schema.legalDocuments.version, websiteVersion: schema.legalDocuments.websiteVersion, rulesetVersion: schema.legalDocuments.rulesetVersion, inventoryVersion: schema.legalDocuments.inventoryVersion, reviewStatus: schema.legalDocuments.reviewStatus, manualEdits: schema.legalDocuments.manualEdits, generatedAt: schema.legalDocuments.generatedAt }).from(schema.legalDocuments).where(eq(schema.legalDocuments.websiteId, (req.params as { id: string }).id)).all() }));
  app.get('/api/legal/ruleset', async () => { const r = loadRuleset(); return { version: r.version, errors: r.errors, rules: r.rules.map((x) => ({ id: x.id, title: x.title, category: x.category, severity: x.severity, jurisdiction: x.jurisdiction, lastReviewed: x.lastReviewed, ruleVersion: x.ruleVersion, checkId: x.automatedCheck?.checkId ?? null, manual: !!x.manualCheck, source: x.sources[0]?.url ?? '' })) }; });

  /** Screenshots and JSON artifacts of a website (qa/, concepts/), read-only. */
  app.get('/api/websites/:id/artifact', async (req, reply) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const { path } = z.object({ path: z.string().min(1).max(300) }).parse(req.query);
    if (!/^(qa|concepts)\//.test(path) || !/\.(png|json|txt)$/.test(path)) return reply.code(400).send({ error: 'only qa/ and concepts/ png/json/txt' });
    const file = safeJoin(pathsFor(w).root, path);
    if (!existsSync(file)) return reply.code(404).send({ error: 'not found' });
    return reply.type(extname(file) === '.png' ? 'image/png' : extname(file) === '.json' ? 'application/json' : 'text/plain; charset=utf-8').header('Cache-Control', 'no-store').send(createReadStream(file));
  });

  app.get('/api/websites/:id/export', async (req, reply) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const c = requireCustomer(w.customerId);
    const p = pathsFor(w);
    if (!existsSync(join(p.current, 'index.html'))) return reply.code(400).send({ error: 'nothing to export — no index.html' });
    const exportDir = safeJoin(p.root, 'exports');
    mkdirSync(exportDir, { recursive: true });
    const name = `${c.slug}-${w.slug}-${w.currentVersion ?? 'draft'}.zip`;
    const file = join(exportDir, name);
    await new Promise<void>((res, rej) => {
      const out = createWriteStream(file);
      const zip = new ZipArchive({ zlib: { level: 9 } });
      out.on('close', () => res());
      zip.on('error', rej);
      zip.pipe(out);
      // Production files only: no git data, no Factory metadata.
      zip.glob('**/*', { cwd: p.current, dot: true, ignore: ['.git', '.git/**', '.gitignore', '**/.DS_Store', '**/*.map'] });
      void zip.finalize();
    });
    audit('user', 'website.export', w.id, { file: relative(p.root, file), version: w.currentVersion, gate: (w.gate as { state?: string } | null)?.state ?? 'NOT_EVALUATED' });
    return reply.header('Content-Disposition', `attachment; filename="${name}"`).type('application/zip').send(createReadStream(file));
  });

  app.post('/api/customers/:id/import', async (req, reply) => {
    const c = requireCustomer((req.params as { id: string }).id);
    const body = z.object({ name: z.string().trim().min(1).max(120), siteType: z.string().default('company'), source: z.string().trim().min(1).max(1000) }).parse(req.body);
    const r = await importSite(c.id, body);
    const job = createJob('import', { customerId: c.id, websiteId: r.site.id, title: `Import analysis · ${c.marketing.companyName} · ${body.name}` });
    return reply.code(202).send({ ...r, job });
  });

  app.get('/api/assets', async () => {
    const rows = db().select().from(schema.assets).all();
    return { assets: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  });
  app.patch('/api/assets/:id', async (req) => {
    const body = z.object({ category: z.enum(['customer', 'generated', 'licensed-stock', 'open-license', 'unknown']).optional(), license: z.string().max(300).optional(), source: z.string().max(500).optional(), alt: z.string().max(300).optional(), reviewStatus: z.enum(['pending', 'approved', 'rejected', 'n/a']).optional() }).parse(req.body);
    const aid = (req.params as { id: string }).id;
    db().update(schema.assets).set(body).where(eq(schema.assets.id, aid)).run();
    audit('user', 'asset.update', aid, body);
    return { asset: db().select().from(schema.assets).where(eq(schema.assets.id, aid)).get() };
  });
  app.post('/api/customers/:id/assets', async (req, reply) => {
    const c = requireCustomer((req.params as { id: string }).id);
    const body = z.object({ filename: z.string().min(1).max(120), dataBase64: z.string().max(20_000_000), category: z.enum(['customer', 'licensed-stock', 'open-license', 'unknown']), source: z.string().max(500), license: z.string().max(300).default(''), alt: z.string().max(300).default(''), purpose: z.string().max(200).default('') }).parse(req.body);
    const ext = extname(body.filename).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.svg', '.avif'].includes(ext)) return reply.code(400).send({ error: 'unsupported image type' });
    const buf = Buffer.from(body.dataBase64, 'base64');
    const name = `${slugify(body.filename.replace(/\.[^.]+$/, ''), 'asset')}${ext}`;
    const file = safeJoin(customerDir(c.slug), 'research', 'assets', name);
    writeFileSync(file, buf);
    const aid = id('ast_');
    db().insert(schema.assets).values({ id: aid, customerId: c.id, websiteId: null, kind: 'image', category: body.category, source: body.source, url: '', license: body.license, localPath: `research/assets/${name}`, alt: body.alt, purpose: body.purpose, reviewStatus: body.category === 'unknown' ? 'pending' : 'pending', createdAt: now() }).run();
    return reply.code(201).send({ id: aid, path: `research/assets/${name}`, size: statSync(file).size });
  });

  app.get('/api/websites/:id/files', async (req) => {
    const w = requireWebsite((req.params as { id: string }).id);
    const p = pathsFor(w);
    return { briefFile: readJson(join(p.root, 'website-brief.json')), conceptReview: readJson(join(p.root, 'concept-review.json')), visualReview: readJson(join(p.qa, 'visual', 'visual-review.json')), implementation: readJson(join(p.root, 'implementation-report.json')), editPlan: readJson(join(p.root, 'edit-plan.json')), gate: readJson(join(p.qa, 'production-gate.json')), consentTests: readJson(join(p.qa, 'privacy', 'consent-tests.json')) };
  });
}
