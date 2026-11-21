import { join } from 'node:path';
import { WebsiteBrief, SITE_TYPE_LABELS, type SiteType } from '@wf/shared';
import { writeJson, now } from '../lib/util.ts';
import { createJob, registerJobKind, type JobContext } from '../orchestrator/jobs.ts';
import { getSettings } from '../lib/settings.ts';
import { runAgentTask } from '../orchestrator/tasks.ts';
import { updateWebsite } from '../storage/websites.ts';
import { siteContext } from './context.ts';

/** Automated brief validation. Issues block implementation until the user approves the brief explicitly. */
export function validateBrief(brief: WebsiteBrief, factIds: Set<string>): string[] {
  const issues: string[] = [];
  if (!brief.pages.length) issues.push('no pages defined');
  const files = brief.pages.map((p) => p.file);
  if (new Set(files).size !== files.length) issues.push('duplicate page files');
  for (const f of files) if (!/^[a-z0-9-]+\.html$/.test(f)) issues.push(`page file must be a flat lowercase .html name: ${f}`);
  if (!files.includes('index.html')) issues.push('index.html missing');
  for (const req of ['impressum.html', 'datenschutz.html']) if (!files.includes(req)) issues.push(`${req} missing`);
  for (const u of brief.factsUsed) if (!factIds.has(u.factId)) issues.push(`claim "${u.claim.slice(0, 60)}" references unknown fact ${u.factId}`);
  if (brief.functionality.analytics !== 'none') issues.push('analytics must not be added automatically');
  return issues;
}

async function writeBrief(ctx: JobContext) {
  const sc = siteContext(ctx.job.websiteId!);
  const { output, route } = await runAgentTask({
    jobId: ctx.job.id, customerId: sc.customer.id, websiteId: sc.site.id, role: 'strategy', cwd: sc.paths.root, signal: ctx.signal, onLog: ctx.log,
    agentOverride: ctx.agentFor('brief'), output: WebsiteBrief, expectedOutput: 'website-brief.json',
    objective: `Write the website brief for "${sc.site.name}" (${SITE_TYPE_LABELS[sc.site.siteType as SiteType] ?? sc.site.siteType}) for ${sc.customer.marketing.companyName}.`,
    prompt: {
      skills: ['german-business-websites', 'local-business-seo', 'company-fact-verification'],
      instructions: [
        'The website content is German. Write all user-facing strings (page titles, CTA labels, section names) in German.',
        'Recommend single-page vs multi-page. Prefer separate pages for substantial company websites (SEO, services, navigation). Landing/campaign pages may be single-page.',
        'Every page needs a flat file name (index.html, leistungen.html, ueber-uns.html, kontakt.html …). Always include impressum.html and datenschutz.html.',
        'factsUsed: list every factual claim you plan to use and the id of the verified/likely fact that supports it. claimsToAvoid: claims that would need facts we do not have (years, counts, awards, reviews, certifications…).',
        'functionality must match the configured website functionality; never add analytics, tracking, Google Maps embeds, reCAPTCHA or social embeds on your own. analytics must be "none".',
        'privacyImplications: what personal data the planned functionality processes (contact form, server logs, embeds) — factual, not legal advice.',
        'Competitor research is for strategic understanding only. Never copy their text, design, images or branding.',
      ],
      artifacts: [
        { name: 'customer-profile.json (trusted, entered by the user)', content: { marketing: sc.customer.marketing, legal: { legalName: sc.customer.legal.legalName, legalForm: sc.customer.legal.legalForm } } },
        { name: 'website-config.json (trusted)', content: { name: sc.site.name, siteType: sc.site.siteType, functionality: sc.site.functionality } },
      ],
      untrusted: [
        { source: 'research facts (verified/likely only, with ids)', content: JSON.stringify(sc.facts, null, 1) },
        { source: 'research summary', content: JSON.stringify({ industryNotes: (sc.research.company as { industryNotes?: string } | null)?.industryNotes ?? '', brand: sc.research.brand }, null, 1) },
        { source: 'competitor analysis', content: JSON.stringify(sc.research.competitors ?? {}, null, 1).slice(0, 20_000) },
        { source: 'existing website analysis', content: JSON.stringify(sc.research.existingSite ?? {}, null, 1).slice(0, 12_000) },
      ],
    },
  });
  const brief: WebsiteBrief = { ...output, functionality: { ...output.functionality, ...(sc.site.functionality as object), analytics: 'none' } };
  const issues = validateBrief(brief, new Set(sc.facts.map((f) => f.id)));
  writeJson(join(sc.paths.root, 'website-brief.json'), { generatedAt: now(), agent: route.agent, fallbackUsed: route.fallbackUsed, validation: { issues, passed: issues.length === 0 }, brief });
  const auto = issues.length === 0 && getSettings().autoAdvance;
  updateWebsite(sc.site.id, { brief, briefApproved: auto });
  if (auto) {
    // Automated validation passed: approve and continue with the concepts (queued behind this job's site lock).
    createJob('concepts', { customerId: sc.customer.id, websiteId: sc.site.id, title: `Design concepts · ${sc.customer.marketing.companyName} · ${sc.site.name}` });
    ctx.log('brief passed automated validation → approved, concepts started');
  }
  return { status: issues.length ? ('warning' as const) : ('pass' as const), detail: issues.length ? `needs review: ${issues.join('; ')}` : `${brief.pages.length} pages · ${brief.architecture} · automated validation passed${auto ? ' · auto-approved, concepts started' : ''}` };
}

registerJobKind('brief', () => [
  { key: 'brief', label: 'Website strategy & brief', agent: 'Claude', state: 'planning', run: writeBrief },
]);
