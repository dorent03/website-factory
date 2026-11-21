import { z } from 'zod';
import { CheckStatus } from './status.ts';

export const QA_SECTIONS = [
  ['visual', 'Visual'], ['responsive', 'Responsive'], ['accessibility', 'Accessibility'], ['performance', 'Performance'],
  ['seo', 'SEO'], ['links', 'Broken Links'], ['console', 'Console'], ['network', 'Network'], ['security', 'Security'],
  ['privacy', 'Privacy'], ['consent', 'Consent'], ['impressum', 'Impressum'], ['datenschutz', 'Datenschutz'], ['forms', 'Forms'], ['assets', 'Assets'],
] as const;
export type QASectionKey = (typeof QA_SECTIONS)[number][0];

export const QAFinding = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'info']),
  message: z.string(),
  page: z.string().default(''),
  viewport: z.string().default(''),
  selector: z.string().default(''),
  evidence: z.string().default(''),
  ruleId: z.string().default(''),
});
export type QAFinding = z.infer<typeof QAFinding>;

export const QASection = z.object({
  key: z.string(),
  label: z.string(),
  status: CheckStatus,
  summary: z.string(),
  findings: z.array(QAFinding),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  artifacts: z.array(z.string()).default([]),
  ranAt: z.string(),
  durationMs: z.number(),
});
export type QASection = z.infer<typeof QASection>;

export const QAReport = z.object({
  websiteId: z.string(),
  websiteVersion: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  sections: z.array(QASection),
  overall: CheckStatus,
});
export type QAReport = z.infer<typeof QAReport>;

export const RESPONSIVE_WIDTHS = [375, 390, 430, 768, 1024, 1280, 1440, 1920] as const;
export const REVIEW_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;
