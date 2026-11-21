import { z } from 'zod';
import { FactStatus } from './status.ts';

/** Fields the research pipeline tries to establish. Legal ones are never auto-resolved on conflict. */
export const RESEARCH_FIELDS = [
  'companyName', 'legalName', 'legalForm', 'street', 'postalCode', 'city', 'country', 'phone', 'email', 'website',
  'representatives', 'registerCourt', 'registerNumber', 'vatId', 'openingHours', 'services', 'serviceArea',
  'foundingYear', 'certifications', 'socialProfiles', 'locations', 'team', 'history', 'industry', 'products',
] as const;
export const LEGAL_RESEARCH_FIELDS = new Set(['legalName', 'legalForm', 'street', 'postalCode', 'city', 'representatives', 'registerCourt', 'registerNumber', 'vatId']);

export const Fact = z.object({
  id: z.string(),
  field: z.string(),
  value: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  provider: z.string(),
  retrievedAt: z.string(),
  confidence: z.number().min(0).max(1),
  status: FactStatus,
  quote: z.string().default(''),
  note: z.string().default(''),
});
export type Fact = z.infer<typeof Fact>;

/**
 * Output contract for the research agent. Strict-schema friendly: no optional keys, no records.
 * The agent reports what it found and where — the Factory assigns statuses, not the agent.
 */
export const ResearchAgentOutput = z.object({
  officialWebsite: z.string(),
  facts: z.array(z.object({
    field: z.string(),
    value: z.string(),
    sourceUrl: z.string(),
    sourceTitle: z.string(),
    confidence: z.number(),
    quote: z.string(),
  })),
  competitors: z.array(z.object({
    name: z.string(), url: z.string(), positioning: z.string(), services: z.array(z.string()),
    pageStructure: z.array(z.string()), ctaPatterns: z.array(z.string()), seoPatterns: z.array(z.string()), visualConventions: z.array(z.string()),
  })),
  brand: z.object({
    colors: z.array(z.object({ hex: z.string(), whereSeen: z.string() })),
    logoUrl: z.string(),
    tone: z.string(),
    typographyObserved: z.string(),
  }),
  industryNotes: z.string(),
  openQuestions: z.array(z.string()),
  suspiciousContent: z.array(z.object({ url: z.string(), description: z.string() })),
});
export type ResearchAgentOutput = z.infer<typeof ResearchAgentOutput>;

export const ExistingSiteAnalysis = z.object({
  url: z.string(),
  analyzedAt: z.string(),
  pages: z.array(z.object({ url: z.string(), title: z.string(), h1: z.string(), status: z.number() })),
  navigation: z.array(z.object({ label: z.string(), href: z.string() })),
  colors: z.array(z.string()),
  fonts: z.array(z.string()),
  thirdPartyOrigins: z.array(z.string()),
  cookies: z.array(z.object({ name: z.string(), domain: z.string() })),
  localStorageKeys: z.array(z.string()),
  hasImpressumLink: z.boolean(),
  hasDatenschutzLink: z.boolean(),
  consentToolDetected: z.string(),
  forms: z.number(),
  iframes: z.array(z.string()),
  notes: z.array(z.string()),
});
export type ExistingSiteAnalysis = z.infer<typeof ExistingSiteAnalysis>;
