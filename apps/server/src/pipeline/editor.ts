import { join } from 'node:path';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { AgentId } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { id, now, writeJson } from '../lib/util.ts';
import { registerJobKind, type JobContext, type StepOutcome } from '../orchestrator/jobs.ts';
import { runAgentTask } from '../orchestrator/tasks.ts';
import { siteContext } from './context.ts';
import { captureManualEdits } from './manual.ts';
import { classifyEdit, type EditRoute } from './routing.ts';
import { listPages } from './pages.ts';
import { renderStep, stepConsent, stepGate, stepLegal, stepPrivacy, stepQA, reviewStep } from './steps.ts';
import { agentWriteForEdit } from './editWrite.ts';
import { latestVersion } from '../storage/versions.ts';

export const EditPlan = z.object({
  summary: z.string(),
  changes: z.array(z.object({ file: z.string(), selectorHint: z.string(), change: z.string() })),
  newCopy: z.array(z.object({ location: z.string(), text: z.string() })),
  risks: z.array(z.string()),
  needsNewFacts: z.array(z.string()),
});
export const Analysis = z.object({ summary: z.string(), findings: z.array(z.object({ topic: z.string(), status: z.enum(['PASS', 'WARNING', 'FAIL', 'MANUAL_REVIEW']), detail: z.string() })), recommendations: z.array(z.string()) });

interface EditInput { message: string; mode: 'auto' | 'claude' | 'codex'; route: EditRoute; annotations: Array<{ selector: string; html: string; text: string; page: string; note: string }>; chatId: string }

function reply(websiteId: string, jobId: string, agent: string, content: string) {
  db().insert(schema.chatMessages).values({ id: id('msg_'), websiteId, role: 'assistant', agent, content: content.slice(0, 8000), jobId, createdAt: now() }).run();
}

async function plan(ctx: JobContext): Promise<StepOutcome> {
  const inp = ctx.input as unknown as EditInput;
  await captureManualEdits(ctx.job.websiteId!);
  if (inp.mode !== 'auto' || !['design', 'content'].includes(inp.route.kind)) return { status: 'skipped', detail: inp.mode === 'auto' ? `${inp.route.kind}: no planning step` : `${inp.mode} selected — single agent` };
  const sc = siteContext(ctx.job.websiteId!);
  const { output, route } = await runAgentTask({
    jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: inp.route.kind === 'content' ? 'content' : 'design-direction', cwd: sc.paths.current, addDirs: [sc.paths.root],
    signal: ctx.signal, onLog: ctx.log, agentOverride: ctx.agentFor('plan'), output: EditPlan, expectedOutput: 'edit-plan.json',
    objective: `Plan this change to the website precisely for an implementer: "${inp.message}"`,
    prompt: {
      skills: ['apple-inspired-web-design', 'german-business-websites', 'frontend-design'],
      instructions: [
        'Read the relevant HTML/CSS files in the current directory. Produce concrete changes per file (selector + what to change), and final German copy where text changes.',
        'Never invent facts. If the request needs facts we do not have (e.g. new services, years, prices), list them in needsNewFacts instead of making them up.',
        'Respect privacy: no external requests; embeds only via the Factory .wf-embed pattern; no analytics.',
      ],
      artifacts: [{ name: 'user-request', content: inp.message }, { name: 'element-annotations', content: inp.annotations }, { name: 'design-system.json', content: sc.designSystem }],
    },
  });
  ctx.remember({ editPlan: output });
  writeJson(join(sc.paths.root, 'edit-plan.json'), { at: now(), agent: route.agent, request: inp.message, plan: output });
  return { detail: `${route.agent}: ${output.changes.length} changes planned — ${output.summary.slice(0, 160)}` };
}

async function implement(ctx: JobContext): Promise<StepOutcome> {
  const inp = ctx.input as unknown as EditInput;
  const sc = siteContext(ctx.job.websiteId!);
  if (inp.route.kind === 'analysis' || inp.route.kind === 'privacy-check' || inp.route.kind === 'review') {
    if (inp.route.kind !== 'analysis') return { status: 'skipped', detail: 'measurement request — no code change' };
    const datenschutz = listPages(sc.paths.current).some((p) => p.path === 'datenschutz.html');
    const { output, route } = await runAgentTask({
      jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: 'legal-reasoning', cwd: sc.paths.current, addDirs: [sc.paths.root], signal: ctx.signal, onLog: ctx.log,
      agentOverride: inp.mode === 'auto' ? ctx.agentFor('implement') : (inp.mode as AgentId), output: Analysis, expectedOutput: 'analysis.json',
      objective: `Answer this request about the website (read-only analysis): "${inp.message}"`,
      prompt: { skills: ['german-website-compliance', 'privacy-audit'], instructions: [datenschutz ? 'Compare datenschutz.html and impressum.html with privacy-inventory.json and legal-audit.json in the parent folder.' : 'The site has no datenschutz.html.', 'You assist with legal reasoning; you do not give legal advice and never claim legal certainty. Use PASS/WARNING/FAIL/MANUAL_REVIEW.'], artifacts: [{ name: 'request', content: inp.message }] },
    });
    reply(sc.site.id, ctx.job.id, route.agent, `${output.summary}\n\n${output.findings.map((f) => `${f.topic}: ${f.status} — ${f.detail}`).join('\n')}${output.recommendations.length ? `\n\nEmpfehlungen:\n- ${output.recommendations.join('\n- ')}` : ''}`);
    return { status: output.findings.some((f) => f.status === 'FAIL') ? 'warning' : 'pass', detail: output.summary.slice(0, 200) };
  }
  const forced: AgentId | null = inp.mode === 'claude' ? 'claude' : inp.mode === 'codex' ? 'codex' : null;
  const r = await agentWriteForEdit(ctx, inp, forced);
  const impact = r.version?.impact as { summary?: string; requiresReaudit?: boolean } | null;
  ctx.remember({ editVersion: r.version?.dirName ?? null, requiresReaudit: !!impact?.requiresReaudit });
  reply(sc.site.id, ctx.job.id, r.agent, `${r.report.summary}\n\nVersion: ${r.version?.dirName ?? 'keine Änderung'}${impact?.summary ? `\nImpact: ${impact.summary}` : ''}${r.report.openIssues.length ? `\nOffen: ${r.report.openIssues.join('; ')}` : ''}`);
  return { detail: `${r.version?.dirName ?? 'no change'} by ${r.agent}${impact?.requiresReaudit ? ` · ${impact.summary}` : ' · no compliance impact'}` };
}

const whenReaudit = (fn: (ctx: JobContext) => Promise<StepOutcome>) => async (ctx: JobContext): Promise<StepOutcome> => {
  const inp = ctx.input as unknown as EditInput;
  const site = siteContext(ctx.job.websiteId!).site;
  const needed = ctx.input.requiresReaudit || inp.route.kind === 'privacy-check' || inp.route.kind === 'analysis' || inp.route.kind === 'review' || site.staleness?.stale;
  return needed ? fn(ctx) : { status: 'skipped', detail: 'no compliance-relevant change' };
};

const whenReview = (fn: (ctx: JobContext) => Promise<StepOutcome>) => async (ctx: JobContext): Promise<StepOutcome> => ((ctx.input as unknown as EditInput).route.kind === 'review' ? fn(ctx) : { status: 'skipped', detail: 'not a review request' });

registerJobKind('edit', () => [
  { key: 'plan', label: 'Claude plans the change', agent: 'Claude', state: 'planning', run: plan },
  { key: 'implement', label: 'Implement change (isolated worktree)', agent: 'Codex', state: 'implementing', run: implement },
  { key: 'privacy', label: 'Re-evaluate privacy inventory', agent: 'Browser', state: 'privacy-audit', run: whenReaudit(stepPrivacy) },
  { key: 'consent', label: 'Re-evaluate consent', agent: 'Browser', state: 'privacy-audit', run: whenReaudit(stepConsent) },
  { key: 'legal', label: 'Re-run legal audit', agent: 'Factory', state: 'legal-audit', run: whenReaudit(stepLegal) },
  { key: 'qa-1', label: 'Technical QA', agent: 'Browser', state: 'technical-review', run: whenReview(stepQA) },
  { key: 'render-final', label: 'Browser render', agent: 'Browser', state: 'rendering', run: whenReview(renderStep('final')) },
  { key: 'review-final', label: 'Claude review', agent: 'Claude', state: 'visual-review', run: whenReview(reviewStep('final', 99)) },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

export function startEdit(websiteId: string, message: string, mode: 'auto' | 'claude' | 'codex', annotations: EditInput['annotations']) {
  const route = classifyEdit(message);
  const chatId = id('msg_');
  db().insert(schema.chatMessages).values({ id: chatId, websiteId, role: 'user', agent: mode, content: message.slice(0, 4000), annotations, createdAt: now() }).run();
  return { route, chatId, version: latestVersion(websiteId)?.dirName ?? null };
}

export function chatHistory(websiteId: string) {
  return db().select().from(schema.chatMessages).where(eq(schema.chatMessages.websiteId, websiteId)).all().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
