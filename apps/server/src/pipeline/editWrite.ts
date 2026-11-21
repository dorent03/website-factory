import type { AgentId } from '@wf/shared';
import type { JobContext } from '../orchestrator/jobs.ts';
import { siteContext } from './context.ts';
import { siteData } from './factory.ts';
import { agentWrite } from './steps.ts';
import type { EditRoute } from './routing.ts';

interface EditInput { message: string; route: EditRoute; annotations: Array<{ selector: string; html: string; text: string; page: string; note: string }> }

/** The writing half of an AI edit: always in a worktree, always versioned, always impact-analysed. */
export async function agentWriteForEdit(ctx: JobContext, inp: EditInput, forced: AgentId | null) {
  const sc = siteContext(ctx.job.websiteId!);
  const plan = ctx.input.editPlan;
  const label = `${forced ?? (inp.route.kind === 'technical' ? 'codex' : 'claude-codex')}-${inp.route.kind}-edit`;
  return agentWrite(ctx, 'implement', label, `Apply this change to the existing website: "${inp.message}"`, [
    'Change only what the request (and plan, if given) requires. Keep everything else identical.',
    inp.annotations.length ? 'The user clicked specific elements in the preview — the annotations give their CSS selectors, page and the instruction for each. Apply each instruction to exactly that element.' : '',
    'If the request asks for something that needs facts we do not have, do not invent them — report it in openIssues.',
    'Adding a YouTube/Vimeo video or a map: use ONLY the .wf-embed pattern described above (no direct iframe). The Factory then updates privacy inventory, consent and Datenschutzerklärung.',
  ].filter(Boolean), [
    { name: 'request', content: inp.message },
    ...(plan ? [{ name: 'edit-plan.json (from Claude)', content: plan }] : []),
    ...(inp.annotations.length ? [{ name: 'element-annotations.json', content: inp.annotations }] : []),
    { name: 'site-data.json', content: siteData(sc) },
    { name: 'design-system.json', content: sc.designSystem },
  ], { agent: forced, role: forced === 'claude' && inp.route.kind !== 'technical' ? 'design-direction' : 'implementation', timeoutMs: 40 * 60_000 });
}
