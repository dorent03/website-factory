import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ImplementationReport, REVIEW_VIEWPORTS, VisualReview, worstStatus, type AgentId, type QAReport, type Role, type StepStatus } from '@wf/shared';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { checkPalette, repairPalette } from '../lib/contrast.ts';
import { profile } from '../lib/settings.ts';
import { id, now, readJson, writeJson } from '../lib/util.ts';
import { auditToText, runLegalAudit } from '../legal/audit.ts';
import { evaluateGate } from '../legal/gate.ts';
import type { JobContext, StepOutcome } from '../orchestrator/jobs.ts';
import { runAgentTask } from '../orchestrator/tasks.ts';
import { consentConfigFor, buildInventory, latestInventory } from '../privacy/inventory.ts';
import { latestConsent, runConsentMatrix, saveConsentResult } from '../privacy/consent.ts';
import { impactAnalysis } from '../privacy/impact.ts';
import { crawlSite } from '../qa/crawl.ts';
import { finalizeReport, runQA } from '../qa/run.ts';
import { captureScreens, shotDir } from '../qa/screens.ts';
import { installConsent, removeConsent } from '../sitekit/index.ts';
import { clearStale, markStale } from '../storage/websites.ts';
import { commitCurrent, createWorktree, integrateWorktree } from '../storage/versions.ts';
import { siteContext, type SiteContext } from './context.ts';
import { factoryPass, installDesignFonts, recordLegalDocuments, registerAssets, siteData } from './factory.ts';
import { listPages } from './pages.ts';
import { captureManualEdits } from './manual.ts';

const IMPLEMENTATION_RULES = [
  'Build a complete, production-quality static website (HTML/CSS/vanilla JS) in the current directory. No build step, no frameworks, no npm. It must work from plain FTP hosting.',
  'Files: one HTML file per page from the brief (flat names, e.g. index.html, leistungen.html, kontakt.html, impressum.html, datenschutz.html), plus 404.html; shared assets/css/styles.css; assets/js/main.js only if needed; graphics in assets/img/.',
  'Use the design system as CSS custom properties with exactly these names: --bg, --surface, --text, --muted, --accent, --accent-contrast, --border (plus any extra tokens). Typography via clamp() from the type scale.',
  'Fonts: if assets/fonts/fonts.css exists, link it (<link rel="stylesheet" href="assets/fonts/fonts.css">) and use the families it defines; otherwise use the system font stack from the design system. NEVER load Google Fonts or any font CDN.',
  'ZERO external requests: no CDNs, no remote images/scripts/styles, no analytics, no tracking, no Google Maps iframes, no social embeds, no reCAPTCHA.',
  'Every page: <html lang="de">, unique German <title> and meta description, og:title/og:description, skip link, <header> with <nav> (main pages only), <main>, <footer>. Exactly one <h1>.',
  'Mobile navigation: a <button> with aria-expanded and aria-controls toggles the menu below ~860px; links reachable by keyboard; touch targets ≥ 44px.',
  'Footer on EVERY page: company name, the exact address/phone/email from site-data.json, and links with the visible text "Impressum" (impressum.html) and "Datenschutz" (datenschutz.html).',
  'impressum.html and datenschutz.html: same layout as other pages, and inside <main> put ONLY the two markers <!-- wf:legal:start --> and <!-- wf:legal:end -->. The Factory inserts the legal text. Never write legal text yourself and never edit between these markers.',
  'Contact form (only if functionality.contactForm): <form method="post" action="kontakt-senden.php">, fields name (required), email (type=email, required), phone (optional), message (textarea, required), each with a visible <label for>. Add a visually hidden honeypot <input type="text" name="website" tabindex="-1" autocomplete="off"> inside an aria-hidden wrapper, and <input type="hidden" name="wf_t"> filled with Math.floor(Date.now()/1000) by JS. Next to the button a sentence linking to datenschutz.html. Show a status message for ?status=ok|invalid|error|limit.',
  'Maps: functionality.map "external-link" → show the address plus a normal link to https://www.openstreetmap.org/search?query=<address>; "address-only" → address only; "embed" → <div class="wf-embed" data-wf-category="external-media" data-wf-service="OpenStreetMap" data-wf-src="https://www.openstreetmap.org/export/embed.html?…" data-wf-title="Karte"></div> (never a direct iframe).',
  'Video: only if functionality.video is "youtube"/"vimeo" → <div class="wf-embed" data-wf-category="external-media" data-wf-service="YouTube" data-wf-src="https://www.youtube-nocookie.com/embed/<id>" data-wf-title="…"></div>. Never a direct iframe.',
  'Content: German, professional, specific to this company, based only on the brief and site-data.json. Never invent facts, numbers, years, awards, certifications, testimonials, team members or locations. Omit sections without data. No lorem ipsum, no placeholder buttons, no dead links.',
  'Imagery: no stock photos and no photos of people. Use typographic, geometric or SVG compositions (saved as assets/img/*.svg) that fit the art direction; every <img> has a meaningful alt (or alt="" if decorative) and width/height.',
  'Accessibility WCAG 2.2 AA: contrast, visible :focus-visible styles, semantic buttons/links, labels, prefers-reduced-motion. Performance: defer JS, lazy-load below-the-fold images, no layout shift.',
  'Do NOT write or run your own test, lint, crawl or validation scripts and do not start servers or browsers: the Factory runs Playwright, axe and Lighthouse QA immediately after you and sends you exact findings. A quick `node --check` on your JS is enough. Finish as soon as the files are complete.',
  'Do not run git, do not create symlinks, do not create PHP or other server-side files, do not write outside the current directory. Do not leave helper scripts, test files, READMEs or QA folders in the output — run checks from a temporary directory outside it or delete them afterwards.',
];

async function screens(sc: SiteContext, tag: string): Promise<string[]> {
  const pages = listPages(sc.paths.current).map((p) => p.path).filter((p) => !/^(impressum|datenschutz|404)/.test(p));
  const pick = [pages[0], ...pages.slice(1).filter((p) => /kontakt|leistung|service/.test(p)).slice(0, 1)].filter(Boolean) as string[];
  const out: string[] = [];
  for (const p of pick) {
    const shots = await captureScreens(sc.preview('current', p), shotDir(sc.paths.qa, tag), p.replace('.html', ''), REVIEW_VIEWPORTS);
    out.push(...shots.map((s) => s.path));
  }
  return out;
}

export async function stepDesignSystem(ctx: JobContext): Promise<StepOutcome> {
  const sc = siteContext(ctx.job.websiteId!);
  const chosen = sc.site.selectedConcept ?? (ctx.input.concept as string | undefined);
  const concept = sc.concepts.find((c) => c.id === chosen);
  if (!concept) throw new Error('No concept selected — select concept A, B or C first.');
  const ds = concept.designSystem;
  const repaired = repairPalette(ds.colors);
  const contrast = checkPalette(ds.colors);
  const version = (db().select().from(schema.designSystems).all().filter((d) => d.websiteId === sc.site.id).length) + 1;
  db().insert(schema.designSystems).values({ id: id('ds_'), websiteId: sc.site.id, version, data: ds, contrast, createdAt: now() }).run();
  writeJson(join(sc.paths.root, 'design-system.json'), { ...ds, concept: concept.id, conceptName: concept.name, contrast, version });
  const failing = contrast.filter((c) => !c.pass);
  return { status: failing.length ? 'warning' : 'pass', detail: `${concept.id} ${concept.name} · ${ds.typography.display.family} / ${ds.typography.body.family}${repaired.length ? ` · ${repaired.length} tokens adjusted` : ''}${failing.length ? ` · contrast issues: ${failing.map((f) => f.pair).join(', ')}` : ' · all contrast pairs pass'}` };
}

/** Writing agent task in an isolated worktree, then validation, impact analysis and a version. */
export async function agentWrite(ctx: JobContext, stepKey: string, label: string, objective: string, instructions: string[], artifacts: Array<{ name: string; content: unknown }>, opts: { images?: string[]; untrusted?: Array<{ source: string; content: string }>; prepare?: (dir: string) => void; skills?: string[]; timeoutMs?: number; agent?: AgentId | null; role?: Role } = {}) {
  const sc = siteContext(ctx.job.websiteId!);
  const wt = await createWorktree(sc.site.id, `${stepKey}-${ctx.job.id.slice(-6)}`);
  opts.prepare?.(wt.path);
  let report: ImplementationReport;
  let agent = '';
  let taskId = '';
  let model = '';
  try {
    const r = await runAgentTask({
      jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: opts.role ?? (stepKey.startsWith('tech') ? 'testing' : 'implementation'), cwd: wt.path, write: true, allowedPaths: [wt.path],
      addDirs: [sc.paths.root], images: opts.images ?? [], signal: ctx.signal, onLog: ctx.log, agentOverride: opts.agent ?? ctx.agentFor(stepKey), output: ImplementationReport, expectedOutput: 'implementation-report.json',
      timeoutMs: opts.timeoutMs ?? 50 * 60_000, objective, inputArtifacts: artifacts.map((a) => a.name),
      prompt: { skills: opts.skills ?? ['frontend-design', 'apple-inspired-web-design', 'static-site-quality', 'responsive-quality-gate', 'accessibility-quality-gate'], instructions: [...IMPLEMENTATION_RULES, ...instructions], artifacts, untrusted: opts.untrusted },
    });
    report = r.output; agent = r.route.agent + (r.route.fallbackUsed ? ' (fallback)' : ''); taskId = r.task.id; model = r.task.model;
  } catch (e) {
    const { discardWorktree } = await import('../storage/versions.ts');
    await discardWorktree(sc.site.id, wt);
    throw e;
  }
  const inv = latestInventory(sc.site.id);
  factoryPass(sc, wt.path, inv);
  const result = await integrateWorktree(sc.site.id, wt, { label, agent, provider: agent.startsWith('claude') ? 'anthropic (Claude Code CLI)' : 'openai (Codex CLI)', model, taskId, prompt: objective }, async (_files, wtPath) => impactAnalysis(sc.paths.current, wtPath));
  writeJson(join(sc.paths.root, 'implementation-report.json'), { at: now(), step: stepKey, agent, report, version: result.version?.dirName ?? null });
  if (result.version) {
    registerAssets(sc, sc.paths.current, `${agent} task ${taskId}`);
    const impact = result.version.impact as ReturnType<typeof impactAnalysis> | null;
    if (impact?.requiresReaudit) markStale(sc.site.id, [`${result.version.dirName}: ${impact.summary}`]);
  }
  return { report, version: result.version, files: result.files, agent };
}

export async function stepImplement(ctx: JobContext): Promise<StepOutcome> {
  const sc = siteContext(ctx.job.websiteId!);
  if (!sc.brief) throw new Error('No brief.');
  if (!sc.site.briefApproved) throw new Error('The website brief has not been approved. Approve it in the workspace (or wizard) before implementation.');
  const ds = sc.designSystem;
  if (!ds) throw new Error('No design system.');
  const conceptDir = join(sc.paths.concepts, sc.site.selectedConcept ?? 'A');
  const r = await agentWrite(ctx, 'implement', 'initial', `Implement the complete website "${sc.site.name}" for ${sc.customer.marketing.companyName} from the approved brief and design system.`, [
    existsSync(conceptDir) ? `The client approved concept ${sc.site.selectedConcept}. Its homepage preview is at ${conceptDir}/index.html (+ styles.css) — use it as the visual starting point and extend it to all pages with the same quality.` : '',
    `Design system with rationale: ${join(sc.paths.root, 'design-system.json')}. Brief: ${join(sc.paths.root, 'website-brief.json')}.`,
  ].filter(Boolean), [
    { name: 'website-brief.json', content: sc.brief },
    { name: 'design-system.json', content: ds },
    { name: 'site-data.json (canonical company data)', content: siteData(sc) },
    { name: 'functionality.json', content: sc.site.functionality },
  ], { prepare: (dir) => installDesignFonts(ds, dir) });
  if (!r.version) throw new Error('Implementation produced no files.');
  clearStale(sc.site.id);
  return { detail: `${r.version.dirName} by ${r.agent}: ${r.report.pages.length || r.files.length} pages/files · ${r.report.summary.slice(0, 160)}` };
}

export function renderStep(tag: string) {
  return async (ctx: JobContext): Promise<StepOutcome> => {
    if (tag !== 'final' && ctx.input.visualApproved) return { status: 'skipped', detail: 'previous review approved' };
    const sc = siteContext(ctx.job.websiteId!);
    const shots = await screens(sc, tag);
    ctx.remember({ [`shots:${tag}`]: shots });
    return { detail: `${shots.length} screenshots (1440/768/390px) of ${sc.site.currentVersion}` };
  };
}

export function reviewStep(tag: string, round: number) {
  return async (ctx: JobContext): Promise<StepOutcome> => {
    if (tag !== 'final' && ctx.input.visualApproved) return { status: 'skipped', detail: 'previous review approved' };
    const sc = siteContext(ctx.job.websiteId!);
    const images = (ctx.input[`shots:${tag}`] as string[] | undefined) ?? [];
    if (!images.length) throw new Error('no screenshots');
    const prevFix = readJson<{ report: ImplementationReport }>(join(sc.paths.root, 'implementation-report.json'))?.report;
    const { output, route } = await runAgentTask({
      jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: 'visual-review', cwd: sc.paths.root, addDirs: [shotDir(sc.paths.qa, tag)], images,
      signal: ctx.signal, onLog: ctx.log, agentOverride: ctx.agentFor(`review-${tag}`), output: VisualReview, expectedOutput: 'visual-review.json',
      objective: `${tag === 'final' ? 'Final qualitative review' : `Visual design review round ${round}`} of the RENDERED website "${sc.site.name}" (${sc.site.currentVersion}).`,
      prompt: {
        skills: ['visual-browser-qa', 'apple-inspired-web-design', 'german-business-websites'],
        instructions: [
          'Look at every screenshot (file names: <page>-desktop.png = 1440px, -tablet.png = 768px, -mobile.png = 390px). Judge the pixels, not assumptions about the code.',
          'Criteria (one entry each, status PASS/WARNING/FAIL with concrete visual evidence): hero hierarchy, navigation (desktop), mobile navigation & header, typography, color & contrast, section spacing & rhythm, alignment & grid, CTA prominence, imagery & art direction, cards & components, footer, mobile hero, overall premium quality & brand fit, content credibility (no invented claims).',
          'findings: only actionable issues, each with page, viewport, a precise problem and an instruction an implementer can execute, plus a selectorHint (CSS selector or element description).',
          'verdict APPROVE only if there is no FAIL and no major issue. Never write "looks good" — evidence for every criterion.',
          prevFix?.addressedFindings.some((a) => a.status === 'wont_fix') ? `The implementer declined these earlier findings: ${JSON.stringify(prevFix.addressedFindings.filter((a) => a.status === 'wont_fix'))}. If you still consider them necessary, keep them and say so in the summary.` : '',
        ].filter(Boolean),
        artifacts: [{ name: 'website-brief.json (summary)', content: { purpose: sc.brief?.purpose, tone: sc.brief?.tone, designDirection: sc.brief?.designDirection, primaryCta: sc.brief?.primaryCta } }],
      },
    });
    const prior = readJson<{ review: { findings: Array<{ area: string }> } }>(join(sc.paths.qa, 'visual', 'visual-review.json'));
    writeJson(join(sc.paths.qa, 'visual', 'visual-review.json'), { at: now(), version: sc.site.currentVersion, tag, round, agent: route.agent, review: output, screenshots: images });
    writeJson(join(sc.paths.qa, 'visual', `visual-review-${tag}.json`), { at: now(), version: sc.site.currentVersion, review: output });
    const declined = prevFix?.addressedFindings.filter((a) => a.status === 'wont_fix').map((a) => a.id) ?? [];
    const conflict = declined.length && prior && output.findings.some((f) => declined.includes(f.id) || prior.review.findings.some((p) => p.area === f.area && declined.length));
    const fails = output.criteria.filter((c) => c.status === 'FAIL').length;
    const warns = output.criteria.filter((c) => c.status === 'WARNING').length;
    if (output.verdict === 'APPROVE') ctx.remember({ visualApproved: true });
    const status: StepStatus = conflict ? 'manual-review' : output.verdict === 'APPROVE' ? (warns ? 'warning' : 'pass') : tag === 'final' ? 'warning' : 'warning';
    return { status, detail: `${output.verdict} · ${fails} FAIL · ${warns} WARNING · ${output.findings.length} findings${conflict ? ' · AGENTS DISAGREE — see review' : ''} — ${output.summary.slice(0, 160)}` };
  };
}

export function fixStep(tag: string, round: number) {
  return async (ctx: JobContext): Promise<StepOutcome> => {
    if (ctx.input.visualApproved) return { status: 'skipped', detail: 'review approved — no fixes needed' };
    const sc = siteContext(ctx.job.websiteId!);
    const review = readJson<{ review: VisualReview; screenshots: string[] }>(join(sc.paths.qa, 'visual', 'visual-review.json'));
    if (!review?.review.findings.length) return { status: 'skipped', detail: 'no actionable findings' };
    const r = await agentWrite(ctx, `visual-fix-${round}`, `claude-design-review-r${round}`, `Fix the visual design findings from the rendered-screenshot review (round ${round}).`, [
      'Fix every finding precisely. If you deliberately decline one (e.g. it conflicts with accessibility or the brief), set status "wont_fix" with a reason — do not silently ignore it.',
      'Keep everything that already works. Do not touch the legal markers or the text between them.',
    ], [{ name: 'visual-review.json', content: review.review }, { name: 'design-system.json', content: sc.designSystem }, { name: 'site-data.json', content: siteData(sc) }], { images: review.screenshots.filter((s) => s.endsWith('-mobile.png') || s.endsWith('-desktop.png')).slice(0, 4) });
    const fixed = r.report.addressedFindings.filter((a) => a.status === 'fixed').length;
    const declined = r.report.addressedFindings.filter((a) => a.status === 'wont_fix').length;
    return { status: declined ? 'warning' : 'pass', detail: `${r.version?.dirName ?? 'no changes'} by ${r.agent}: ${fixed} fixed${declined ? `, ${declined} declined` : ''}` };
  };
}

export async function stepQA(ctx: JobContext): Promise<StepOutcome> {
  const manual = await captureManualEdits(ctx.job.websiteId!);
  if (manual) ctx.log(`captured manual edits as ${manual}`);
  const report = await runQA(ctx.job.websiteId!, undefined, (l) => ctx.log(`qa: ${l}`));
  ctx.remember({ lastQa: report.finishedAt });
  const measured = report.sections.filter((s) => !['visual', 'privacy', 'consent', 'impressum', 'datenschutz'].includes(s.key));
  const failing = measured.filter((s) => s.status === 'FAIL').map((s) => s.label);
  const warn = measured.filter((s) => s.status === 'WARNING').map((s) => s.label);
  return { status: failing.length ? 'fail' : warn.length ? 'warning' : 'pass', detail: `${measured.map((s) => `${s.label} ${s.status}`).join(' · ')}` };
}
export async function stepTechnicalFix(ctx: JobContext): Promise<StepOutcome> {
  const sc = siteContext(ctx.job.websiteId!);
  const report = readJson<QAReport>(join(sc.paths.qa, 'qa-report.json'));
  if (!report) throw new Error('no QA report');
  const keys = ['responsive', 'accessibility', 'seo', 'performance', 'security', 'links', 'console', 'forms', 'network'];
  const findings = report.sections.filter((s) => keys.includes(s.key)).flatMap((s) => s.findings.filter((f) => f.severity !== 'info').map((f) => ({ section: s.key, ...f })));
  const actionable = findings.filter((f) => f.severity !== 'minor' || ['responsive', 'accessibility', 'seo'].includes(f.section));
  if (!actionable.length) return { status: 'skipped', detail: 'no actionable technical findings' };
  const r = await agentWrite(ctx, 'tech-fix', 'codex-technical-fix', 'Fix the technical QA findings measured by the Factory (responsive, accessibility, SEO, performance, security, links, console, forms).', [
    'These findings come from real Playwright/axe/Lighthouse runs. Fix root causes in the source files. Use the ids "<section>:<index>" for addressedFindings.',
    'Keep the visual design. Do not touch legal markers or the text between them.',
  ], [{ name: 'qa-findings.json', content: actionable.slice(0, 60).map((f, i) => ({ id: `${f.section}:${i}`, ...f })) }, { name: 'site-data.json', content: siteData(sc) }], { skills: ['responsive-quality-gate', 'accessibility-quality-gate', 'static-site-quality', 'local-business-seo'] });
  return { detail: `${r.version?.dirName ?? 'no changes'} by ${r.agent}: ${r.report.addressedFindings.filter((a) => a.status === 'fixed').length}/${actionable.length} addressed` };
}

export async function stepPrivacy(ctx: JobContext): Promise<StepOutcome> {
  const manual = await captureManualEdits(ctx.job.websiteId!);
  if (manual) ctx.log(`captured manual edits as ${manual}`);
  const sc0 = siteContext(ctx.job.websiteId!);
  let inv = await buildInventory(sc0.site.id);
  for (let i = 0; i < 2; i++) {
    const sc = siteContext(sc0.site.id);
    const prev = latestConsent(sc.site.id)?.config.version ?? 0;
    if (inv.consentRequired) installConsent(sc.paths.current, consentConfigFor(inv, prev));
    else removeConsent(sc.paths.current);
    factoryPass(sc, sc.paths.current, inv);
    const v = await commitCurrent(sc.site.id, { label: inv.consentRequired ? 'privacy-consent' : 'privacy-documentation', agent: 'factory', provider: 'factory', model: '', prompt: 'Privacy inventory → consent + Datenschutzerklärung' });
    if (!v) break;
    ctx.log(`privacy: ${v.dirName} updated consent/documentation, re-measuring`);
    inv = await buildInventory(sc.site.id);
  }
  const sc = siteContext(sc0.site.id);
  recordLegalDocuments(sc, inv.version);
  const st = worstStatus(inv.services.map((s) => s.status));
  return { status: st === 'FAIL' ? 'fail' : st === 'PASS' ? 'pass' : 'warning', detail: `v${inv.version}: ${inv.services.map((s) => `${s.service} ${s.status}`).join(' · ')}${inv.undeclaredOrigins.length ? ` · UNDECLARED: ${inv.undeclaredOrigins.join(', ')}` : ''} · consent ${inv.consentRequired ? 'required' : 'not required'}` };
}

export async function stepConsent(ctx: JobContext): Promise<StepOutcome> {
  const id_ = ctx.job.websiteId!;
  const inv = latestInventory(id_);
  if (!inv) throw new Error('no privacy inventory');
  const cfg = inv.consentRequired ? consentConfigFor(inv, (latestConsent(id_)?.config.version ?? 1) - 1) : null;
  const res = await runConsentMatrix(id_, inv, cfg);
  saveConsentResult(id_, cfg, res);
  return { status: res.status === 'FAIL' ? 'fail' : res.status === 'PASS' ? 'pass' : 'warning', detail: res.required ? res.runs.map((r) => `${r.state} ${r.status}`).concat(res.checks.map((c) => `${c.check} ${c.status}`)).join(' · ') : 'NOT REQUIRED — no consent-dependent services or storage' };
}

export async function stepLegal(ctx: JobContext): Promise<StepOutcome> {
  const sc = siteContext(ctx.job.websiteId!);
  const pages = listPages(sc.paths.current).map((p) => p.path);
  const crawl = await crawlSite(sc.preview('current'), pages);
  const inv = latestInventory(sc.site.id);
  const consent = latestConsent(sc.site.id)?.result ?? null;
  const audit = runLegalAudit({ customer: sc.customer, websiteId: sc.site.id, siteType: sc.site.siteType, functionality: sc.site.functionality as never, siteDir: sc.paths.current, inventory: inv, consent, crawl, websiteVersion: sc.site.currentVersion ?? 'draft' });
  db().insert(schema.legalAudits).values({ id: id('lga_'), websiteId: sc.site.id, websiteVersion: audit.websiteVersion, data: audit, createdAt: now() }).run();
  writeJson(join(sc.paths.qa, 'legal', 'legal-audit.json'), audit);
  writeJson(join(sc.paths.root, 'legal-audit.json'), audit);
  writeJson(join(sc.customerRoot, 'legal', 'legal-audit.json'), { websites: { [sc.site.slug]: audit } });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(sc.paths.qa, 'legal', 'legal-audit.txt'), auditToText(audit));
  const v = db().select().from(schema.websiteVersions).all().find((x) => x.websiteId === sc.site.id && x.dirName === audit.websiteVersion);
  if (v) db().update(schema.websiteVersions).set({ legalState: audit.overall }).where(eq(schema.websiteVersions.id, v.id)).run();
  if (inv && inv.websiteVersion === audit.websiteVersion && !audit.blockingReasons.length) clearStale(sc.site.id);
  const failed = audit.sections.filter((s) => s.status === 'FAIL').map((s) => s.label);
  return { status: failed.length ? 'fail' : audit.manualReview.length ? 'manual-review' : 'pass', detail: `${audit.overall.replace(/_/g, ' ')}${failed.length ? ` · FAIL: ${failed.join(', ')}` : ''} · ${audit.manualReview.length} manual review item(s)` };
}

export async function stepGate(ctx: JobContext): Promise<StepOutcome> {
  finalizeReport(ctx.job.websiteId!, []);
  const g = evaluateGate(ctx.job.websiteId!);
  return { status: g.state === 'BLOCKED' ? 'fail' : 'manual-review', detail: g.state === 'BLOCKED' ? `BLOCKED: ${g.reasons.slice(0, 4).map((r) => r.message).join(' · ')}` : `${g.state.replace(/_/g, ' ')} · ${g.manualReview.length} manual review item(s)` };
}

export const maxRounds = () => profile().rounds;
