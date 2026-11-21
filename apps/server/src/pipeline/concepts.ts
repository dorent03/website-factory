import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ConceptReview, ConceptSet, ImplementationReport, REVIEW_VIEWPORTS, type ConceptSpec } from '@wf/shared';
import { AgentError, WAITING_KINDS } from '../agents/errors.ts';
import { checkPalette, repairPalette } from '../lib/contrast.ts';
import { safeJoin } from '../lib/safePath.ts';
import { now, readJson, writeJson } from '../lib/util.ts';
import { registerJobKind, type JobContext } from '../orchestrator/jobs.ts';
import { runAgentTask } from '../orchestrator/tasks.ts';
import { captureScreens, shotDir } from '../qa/screens.ts';
import { fontCatalogForPrompt, installFont } from '../sitekit/fonts.ts';
import { scanTree, stripAgentHelpers } from '../storage/versions.ts';
import { updateWebsite } from '../storage/websites.ts';
import { siteContext } from './context.ts';

export const COLOR_TOKENS = 'bg, surface, text, muted, accent, accent-contrast, border';

export const designRules = [
  `Colors: hex (#rrggbb) only. Required semantic tokens: ${COLOR_TOKENS}. Optional extras allowed (e.g. accent-2, surface-2). Do not default to blue — derive the palette from the brand colors, logo, industry and research.`,
  'Typography: choose deliberately. Use either a system font stack (source "system", fontsourcePackage "") or a font from this self-hosted catalog (source "self-hosted"). Never Google Fonts or any CDN. Do not pick Inter by default.',
  'Type scale tokens display, h1, h2, h3, body, small, label with responsive clamp() sizes; body ≥ 1rem; measure (line length) around 60–75ch.',
  'Apple-inspired means principles (typography, spacing, hierarchy, restraint, precise motion) — never copying apple.com layouts, wording or assets.',
];

async function conceptSpecs(ctx: JobContext) {
  const sc = siteContext(ctx.job.websiteId!);
  if (!sc.brief) throw new Error('No website brief yet — run the brief step first.');
  const { output, route } = await runAgentTask({
    jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: 'design-direction', cwd: sc.paths.root, signal: ctx.signal, onLog: ctx.log,
    agentOverride: ctx.agentFor('concept-specs'), output: ConceptSet, expectedOutput: 'concepts.json',
    objective: `Create three distinct design concepts (A, B, C) for "${sc.site.name}" of ${sc.customer.marketing.companyName}.`,
    prompt: {
      skills: ['apple-inspired-web-design', 'frontend-design', 'german-business-websites'],
      instructions: [
        'Each concept is a genuinely different direction (e.g. "Premium Minimal", "Technical Precision", "Modern Local") — different palette, typography pairing, layout rhythm and art direction. Name each concept in 2–3 words.',
        'Each concept includes a complete design system (semantic tokens), hero copy in German based only on verified facts, 4–6 homepage sections with German headings/body text, imagery direction and layout notes.',
        'Imagery: no stock photos of people presented as staff; if no customer photos exist, plan typographic, geometric or illustrative compositions (CSS/SVG).',
        ...designRules,
        `Self-hosted font catalog:\n${fontCatalogForPrompt()}`,
      ],
      artifacts: [
        { name: 'website-brief.json', content: sc.brief },
        { name: 'brand-input.json (trusted)', content: { brandColors: sc.customer.marketing.brandColors, industry: sc.customer.marketing.industry } },
      ],
      untrusted: [
        { source: 'brand research', content: JSON.stringify(sc.research.brand ?? {}, null, 1) },
        { source: 'existing website colors/fonts', content: JSON.stringify({ colors: (sc.research.existingSite as { colors?: string[] } | null)?.colors, fonts: (sc.research.existingSite as { fonts?: string[] } | null)?.fonts }) },
      ],
    },
  });
  const ids = ['A', 'B', 'C'] as const;
  const concepts = output.concepts.slice(0, 3).map((c, i) => ({ ...c, id: ids[i]! }));
  if (concepts.length < 2) throw new Error(`agent returned ${concepts.length} concepts, need at least 2`);
  const contrast: Record<string, { repaired: string[]; checks: ReturnType<typeof checkPalette> }> = {};
  for (const c of concepts) {
    const repaired = repairPalette(c.designSystem.colors);
    contrast[c.id] = { repaired, checks: checkPalette(c.designSystem.colors) };
  }
  writeJson(join(sc.paths.concepts, 'concepts.json'), { generatedAt: now(), agent: route.agent, concepts, contrast });
  updateWebsite(sc.site.id, { concepts: { concepts, contrast }, selectedConcept: null });
  const repairedCount = Object.values(contrast).reduce((n, c) => n + c.repaired.length, 0);
  return { detail: `${concepts.map((c) => `${c.id} ${c.name}`).join(' · ')}${repairedCount ? ` · ${repairedCount} color tokens adjusted for WCAG contrast` : ''}` };
}

export function prepareFonts(ds: ConceptSpec['designSystem'], dir: string, urlPrefix: string): { css: string; installed: string[] } {
  const css: string[] = [];
  const installed: string[] = [];
  for (const t of [ds.typography.display, ds.typography.body]) {
    if (t.source !== 'self-hosted' || !t.fontsourcePackage || installed.includes(t.fontsourcePackage)) continue;
    try {
      const f = installFont(t.fontsourcePackage, dir, urlPrefix);
      css.push(`/* ${f.family} — ${f.license}. ${f.attribution} */\n${f.css}`);
      installed.push(f.pkg);
    } catch { /* not in catalog: agent must use system stack */ }
  }
  return { css: css.join('\n\n'), installed };
}

async function conceptPreviews(ctx: JobContext) {
  const sc = siteContext(ctx.job.websiteId!);
  if (!sc.concepts.length) throw new Error('No concepts yet.');
  const runs = sc.concepts.map(async (c) => {
    const dir = safeJoin(sc.paths.concepts, c.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'fonts'), { recursive: true });
    const fonts = prepareFonts(c.designSystem, join(dir, 'fonts'), 'fonts/');
    writeFileSync(join(dir, 'fonts', 'fonts.css'), fonts.css || '/* system font stack — no font files */\n');
    writeJson(join(dir, 'concept.json'), c);
    const { route } = await runAgentTask({
      jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: 'implementation', cwd: dir, write: true, allowedPaths: [dir], signal: ctx.signal, onLog: (l) => ctx.log(`[${c.id}] ${l}`),
      agentOverride: ctx.agentFor('concept-previews'), output: ImplementationReport, expectedOutput: 'implementation-report.json', timeoutMs: 30 * 60_000,
      objective: `Build a renderable homepage preview for design concept ${c.id} "${c.name}" in the current directory.`,
      prompt: {
        skills: ['frontend-design', 'apple-inspired-web-design', 'static-site-quality'],
        instructions: [
          'Create index.html, styles.css and (only if needed) script.js in the current directory. Read concept.json — it contains the design system, copy and art direction. Implement it faithfully and beautifully; this preview is what the client chooses from.',
          'Link fonts via <link rel="stylesheet" href="fonts/fonts.css"> when the concept uses self-hosted fonts; the font files are already in fonts/. Otherwise use the system font stack named in the concept.',
          'Strictly no external requests: no CDNs, no Google Fonts, no remote images, no analytics, no iframes. Everything local.',
          'Use CSS custom properties named after the design tokens. Responsive from 375px to 1920px, no horizontal overflow, semantic HTML (header/nav/main/section/footer), visible focus states, prefers-reduced-motion respected.',
          'Content is German. Use only the copy and facts given in concept.json; never invent numbers, awards, testimonials, team members or certifications. No lorem ipsum.',
          'No photos of people. Use typographic, geometric or SVG compositions where imagery is needed.',
          'Do NOT write or run test/validation scripts or start servers/browsers — the Factory renders and reviews the preview right after you. Work fast: one page, done.',
          'Do not run git. Do not create files outside the current directory. Do not leave helper scripts, test files, READMEs or QA folders in the output — only files the preview needs.',
        ],
      },
    });
    const removed = stripAgentHelpers(dir);
    if (removed.length) ctx.log(`[${c.id}] removed agent helper files: ${removed.join(', ')}`);
    const problems = scanTree(dir);
    if (problems.length) throw new Error(`concept ${c.id} rejected: ${problems.join('; ')}`);
    return `${c.id}:${route.agent}${route.fallbackUsed ? '(fallback)' : ''}`;
  });
  const results = await Promise.allSettled(runs);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  const waiting = failed.find((r) => r.reason instanceof AgentError && WAITING_KINDS.has(r.reason.kind));
  if (waiting) throw waiting.reason;
  if (failed.length === results.length) throw failed[0]!.reason;
  const okList = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled').map((r) => r.value);
  return { status: failed.length ? ('warning' as const) : ('pass' as const), detail: `${okList.join(' · ')}${failed.length ? ` · ${failed.length} failed: ${failed.map((f) => String(f.reason?.message ?? f.reason).slice(0, 120)).join('; ')}` : ''}` };
}

async function renderConcepts(ctx: JobContext) {
  const sc = siteContext(ctx.job.websiteId!);
  const shots: Record<string, string[]> = {};
  for (const c of sc.concepts) {
    const list = await captureScreens(sc.preview('concepts', `${c.id}/index.html`), shotDir(sc.paths.qa, 'concepts'), c.id, REVIEW_VIEWPORTS.filter((v) => v.name !== 'tablet'));
    shots[c.id] = list.map((s) => s.path);
  }
  ctx.remember({ conceptShots: shots });
  return { detail: `${Object.values(shots).flat().length} screenshots` };
}

async function reviewConcepts(ctx: JobContext) {
  const sc = siteContext(ctx.job.websiteId!);
  const shots = (ctx.input.conceptShots ?? {}) as Record<string, string[]>;
  const images = Object.values(shots).flat();
  if (!images.length) throw new Error('no screenshots to review');
  const { output, route } = await runAgentTask({
    jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: 'visual-review', cwd: sc.paths.root, addDirs: [shotDir(sc.paths.qa, 'concepts')], images,
    signal: ctx.signal, onLog: ctx.log, agentOverride: ctx.agentFor('concept-review'), output: ConceptReview, expectedOutput: 'concept-review.json',
    objective: 'Review the rendered design concept previews (actual screenshots) and recommend one.',
    prompt: {
      skills: ['visual-browser-qa', 'apple-inspired-web-design'],
      instructions: [
        `Screenshots are named <concept>-desktop.png (1440px) and <concept>-mobile.png (390px). Concepts: ${sc.concepts.map((c) => `${c.id} = ${c.name}`).join(', ')}.`,
        'For each concept rate these criteria with PASS/WARNING/FAIL and concrete evidence from the pixels: hierarchy, typography, color & contrast, spacing & rhythm, CTA prominence, imagery/art direction, navigation, mobile quality, brand fit, distinctiveness.',
        'Never answer "looks good". Every criterion needs evidence and, unless PASS, a concrete recommendation.',
        'Recommend the concept that best serves the brief, with reasons. The client makes the final choice.',
      ],
      artifacts: [{ name: 'website-brief.json', content: sc.brief }, { name: 'concepts.json', content: sc.concepts.map((c) => ({ id: c.id, name: c.name, rationale: c.rationale })) }],
    },
  });
  writeJson(join(sc.paths.root, 'concept-review.json'), { generatedAt: now(), agent: route.agent, review: output, screenshots: shots });
  updateWebsite(sc.site.id, { conceptReview: output });
  return { status: 'manual-review' as const, detail: `recommends ${output.recommendation}: ${output.recommendationReason.slice(0, 200)} — select a concept to continue` };
}

registerJobKind('concepts', () => [
  { key: 'concept-specs', label: 'Design concepts & design systems', agent: 'Claude', state: 'designing', run: conceptSpecs },
  { key: 'concept-previews', label: 'Concept previews (3× in parallel)', agent: 'Codex', state: 'generating', run: conceptPreviews },
  { key: 'concept-render', label: 'Render concepts', agent: 'Browser', state: 'rendering', run: renderConcepts },
  { key: 'concept-review', label: 'Claude design review', agent: 'Claude', state: 'visual-review', run: reviewConcepts },
]);

export const ConceptSelection = z.object({ concept: z.enum(['A', 'B', 'C']) });
export function conceptShotsFor(qaRoot: string): Record<string, string[]> | null {
  return readJson<{ screenshots: Record<string, string[]> }>(join(qaRoot, '..', 'concept-review.json'))?.screenshots ?? null;
}
