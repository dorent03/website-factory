import { z } from 'zod';

export const SITE_TYPES = ['company', 'landing', 'portfolio', 'trades', 'professional-services', 'local-business', 'consulting', 'restaurant', 'recruiting', 'campaign', 'custom'] as const;
export const SiteType = z.enum(SITE_TYPES);
export type SiteType = z.infer<typeof SiteType>;
export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  company: 'Company Website', landing: 'Landing Page', portfolio: 'Portfolio', trades: 'Trades / Handwerk',
  'professional-services': 'Professional Services', 'local-business': 'Local Business', consulting: 'Consulting',
  restaurant: 'Restaurant', recruiting: 'Recruiting', campaign: 'Campaign', custom: 'Custom',
};

export const Functionality = z.object({
  contactForm: z.boolean(),
  map: z.enum(['none', 'address-only', 'external-link', 'embed']),
  video: z.enum(['none', 'self-hosted', 'youtube', 'vimeo']),
  newsletter: z.boolean(),
  booking: z.boolean(),
  shop: z.boolean(),
  jobApplications: z.boolean(),
  userAccounts: z.boolean(),
  analytics: z.enum(['none']),
  socialEmbeds: z.boolean(),
});
export type Functionality = z.infer<typeof Functionality>;

export const BriefPage = z.object({ slug: z.string(), file: z.string(), title: z.string(), purpose: z.string(), sections: z.array(z.string()), primaryKeyword: z.string() });

export const WebsiteBrief = z.object({
  customer: z.string(),
  siteType: z.string(),
  purpose: z.string(),
  targetAudience: z.array(z.string()),
  services: z.array(z.string()),
  usp: z.array(z.string()),
  tone: z.string(),
  architecture: z.enum(['single-page', 'multi-page']),
  architectureRationale: z.string(),
  pages: z.array(BriefPage),
  primaryCta: z.object({ label: z.string(), target: z.string() }),
  secondaryCta: z.object({ label: z.string(), target: z.string() }),
  seo: z.object({ primaryKeywords: z.array(z.string()), localTerms: z.array(z.string()), titlePattern: z.string() }),
  contentStrategy: z.string(),
  brandDirection: z.string(),
  designDirection: z.string(),
  functionality: Functionality,
  privacyImplications: z.array(z.string()),
  factsUsed: z.array(z.object({ claim: z.string(), factId: z.string() })),
  claimsToAvoid: z.array(z.string()),
});
export type WebsiteBrief = z.infer<typeof WebsiteBrief>;

const Token = z.object({ token: z.string(), value: z.string(), role: z.string() });
const TypeStep = z.object({ token: z.enum(['display', 'h1', 'h2', 'h3', 'body', 'small', 'label']), size: z.string(), lineHeight: z.string(), weight: z.string(), letterSpacing: z.string() });

export const DesignSystem = z.object({
  name: z.string(),
  colors: z.array(Token),
  typography: z.object({
    display: z.object({ family: z.string(), source: z.enum(['system', 'self-hosted']), fontsourcePackage: z.string() }),
    body: z.object({ family: z.string(), source: z.enum(['system', 'self-hosted']), fontsourcePackage: z.string() }),
    scale: z.array(TypeStep),
    measure: z.string(),
  }),
  spacing: z.array(Token),
  containers: z.array(Token),
  breakpoints: z.array(Token),
  radius: z.array(Token),
  shadows: z.array(Token),
  buttons: z.string(),
  forms: z.string(),
  navigation: z.string(),
  motion: z.object({ durationFast: z.string(), durationBase: z.string(), easing: z.string(), reducedMotion: z.string() }),
  imageStyle: z.string(),
});
export type DesignSystem = z.infer<typeof DesignSystem>;

export const ConceptSpec = z.object({
  id: z.enum(['A', 'B', 'C']),
  name: z.string(),
  rationale: z.string(),
  designSystem: DesignSystem,
  hero: z.object({ eyebrow: z.string(), headline: z.string(), subline: z.string(), ctaLabel: z.string() }),
  sections: z.array(z.object({ kind: z.string(), heading: z.string(), body: z.string() })),
  imageryDirection: z.string(),
  layoutNotes: z.string(),
});
export type ConceptSpec = z.infer<typeof ConceptSpec>;
export const ConceptSet = z.object({ concepts: z.array(ConceptSpec) });

/** Structured visual review: one status per criterion, never "looks good". */
export const ReviewCriterion = z.object({ id: z.string(), label: z.string(), status: z.enum(['PASS', 'WARNING', 'FAIL']), viewport: z.string(), evidence: z.string(), recommendation: z.string() });
export const Finding = z.object({
  id: z.string(), severity: z.enum(['critical', 'major', 'minor']), area: z.string(), page: z.string(), viewport: z.string(),
  problem: z.string(), instruction: z.string(), selectorHint: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const VisualReview = z.object({
  criteria: z.array(ReviewCriterion),
  findings: z.array(Finding),
  verdict: z.enum(['APPROVE', 'CHANGES_REQUESTED']),
  summary: z.string(),
});
export type VisualReview = z.infer<typeof VisualReview>;

export const ConceptReview = z.object({
  concepts: z.array(z.object({ id: z.string(), criteria: z.array(ReviewCriterion), strengths: z.array(z.string()), weaknesses: z.array(z.string()) })),
  recommendation: z.string(),
  recommendationReason: z.string(),
});
export type ConceptReview = z.infer<typeof ConceptReview>;

export const ImplementationReport = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
  pages: z.array(z.string()),
  addressedFindings: z.array(z.object({ id: z.string(), status: z.enum(['fixed', 'partial', 'wont_fix']), note: z.string() })),
  externalOrigins: z.array(z.string()),
  openIssues: z.array(z.string()),
});
export type ImplementationReport = z.infer<typeof ImplementationReport>;

export const TechnicalReview = z.object({
  findings: z.array(Finding),
  verdict: z.enum(['APPROVE', 'CHANGES_REQUESTED']),
  summary: z.string(),
});
export type TechnicalReview = z.infer<typeof TechnicalReview>;
