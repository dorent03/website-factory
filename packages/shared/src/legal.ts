import { z } from 'zod';
import { CheckStatus } from './status.ts';

export const LegalRule = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  jurisdiction: z.string(),
  category: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), publisher: z.string().default(''), retrieved: z.string().default('') })).min(1),
  lastReviewed: z.string(),
  ruleVersion: z.string(),
  severity: z.enum(['blocker', 'major', 'minor', 'info']),
  appliesWhen: z.object({
    siteTypes: z.array(z.string()).default([]),
    modules: z.array(z.string()).default([]),
    legalForms: z.array(z.string()).default([]),
    conditions: z.array(z.string()).default([]),
  }).default({ siteTypes: [], modules: [], legalForms: [], conditions: [] }),
  requiredFields: z.array(z.string()).default([]),
  automatedCheck: z.object({ checkId: z.string(), params: z.record(z.string(), z.unknown()).default({}) }).nullable(),
  manualCheck: z.string().nullable(),
});
export type LegalRule = z.infer<typeof LegalRule>;

export const LegalFinding = z.object({
  ruleId: z.string(), status: CheckStatus, message: z.string(), evidence: z.string().default(''), sourceUrl: z.string().default(''), severity: z.string().default('major'),
});
export type LegalFinding = z.infer<typeof LegalFinding>;

export const LEGAL_AUDIT_SECTIONS = [
  ['impressum', 'Impressum'], ['datenschutz', 'Datenschutz'], ['inventory', 'Privacy Inventory'], ['consent', 'Consent'],
  ['third-parties', 'Third Parties'], ['fonts', 'Fonts'], ['forms', 'Forms'], ['consistency', 'Company Data'],
  ['legal-links', 'Legal Links'], ['assets', 'Asset Rights'], ['structured-data', 'Structured Data'], ['accessibility', 'Accessibility Law'], ['modules', 'Special Modules'],
] as const;

export const LegalAudit = z.object({
  generatedAt: z.string(),
  websiteVersion: z.string(),
  rulesetVersion: z.string(),
  inventoryVersion: z.number(),
  sections: z.array(z.object({ key: z.string(), label: z.string(), status: CheckStatus, findings: z.array(LegalFinding) })),
  overall: z.enum(['TECHNICAL_COMPLIANCE_CHECK_PASSED', 'TECHNICAL_COMPLIANCE_CHECK_FAILED', 'MANUAL_REVIEW_REQUIRED']),
  manualReview: z.array(z.string()),
  blockingReasons: z.array(z.string()),
  disclaimer: z.string(),
});
export type LegalAudit = z.infer<typeof LegalAudit>;

export const GateState = z.enum(['BLOCKED', 'READY_FOR_HUMAN_REVIEW', 'READY_FOR_PRODUCTION', 'NOT_EVALUATED']);
export type GateState = z.infer<typeof GateState>;
export const ProductionGate = z.object({
  state: GateState,
  reasons: z.array(z.object({ code: z.string(), message: z.string(), source: z.string() })),
  manualReview: z.array(z.string()),
  evaluatedAt: z.string(),
  websiteVersion: z.string(),
  signedOffBy: z.string().default(''),
  signOffNote: z.string().default(''),
});
export type ProductionGate = z.infer<typeof ProductionGate>;

export const LEGAL_DISCLAIMER = 'Technische Prüfung auf Basis des hinterlegten Regelwerks. Keine Rechtsberatung und keine Garantie der Rechtskonformität. Eine abschließende juristische Prüfung wird empfohlen.';
