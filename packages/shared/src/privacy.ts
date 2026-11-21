import { z } from 'zod';
import { CheckStatus } from './status.ts';

export const ServiceCategory = z.enum(['hosting', 'necessary', 'preferences', 'analytics', 'marketing', 'external-media', 'fonts', 'forms', 'cdn', 'captcha', 'maps', 'social', 'other']);
export type ServiceCategory = z.infer<typeof ServiceCategory>;
export const ConsentCategory = z.enum(['necessary', 'preferences', 'analytics', 'marketing', 'external-media']);
export type ConsentCategory = z.infer<typeof ConsentCategory>;

export const PrivacyService = z.object({
  id: z.string(),
  service: z.string(),
  provider: z.string(),
  category: ServiceCategory,
  consentCategory: ConsentCategory,
  purpose: z.string(),
  dataInvolved: z.array(z.string()),
  loading: z.enum(['always', 'after-consent', 'on-submit', 'unknown']),
  endpoints: z.array(z.string()),
  cookies: z.array(z.string()),
  localStorage: z.array(z.string()),
  sessionStorage: z.array(z.string()),
  consentDependency: z.boolean(),
  privacySectionKey: z.string(),
  privacySectionPresent: z.boolean(),
  requestBeforeConsent: z.boolean().nullable(),
  detectedBy: z.array(z.enum(['static', 'runtime', 'declared'])),
  status: CheckStatus,
  notes: z.array(z.string()),
});
export type PrivacyService = z.infer<typeof PrivacyService>;

export const StorageEntry = z.object({ name: z.string(), domain: z.string(), page: z.string(), category: ConsentCategory.or(z.literal('unknown')), phase: z.string() });
export type StorageEntry = z.infer<typeof StorageEntry>;
export const ObservedRequest = z.object({ url: z.string(), origin: z.string(), resourceType: z.string(), page: z.string(), phase: z.string(), firstParty: z.boolean() });
export type ObservedRequest = z.infer<typeof ObservedRequest>;

export const FormInventory = z.object({
  page: z.string(), action: z.string(), method: z.string(), target: z.string(),
  fields: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean(), label: z.string() })),
  hasPrivacyNotice: z.boolean(), hasHoneypot: z.boolean(),
});
export type FormInventory = z.infer<typeof FormInventory>;

export const PrivacyInventory = z.object({
  version: z.number(),
  websiteVersion: z.string(),
  generatedAt: z.string(),
  hosting: z.object({ provider: z.string(), location: z.string(), serverLogs: z.boolean(), avvSigned: z.enum(['yes', 'no', 'unknown']) }),
  services: z.array(PrivacyService),
  forms: z.array(FormInventory),
  cookies: z.array(StorageEntry),
  localStorage: z.array(StorageEntry),
  sessionStorage: z.array(StorageEntry),
  requests: z.array(ObservedRequest),
  undeclaredOrigins: z.array(z.string()),
  consentRequired: z.boolean(),
  consentReasons: z.array(z.string()),
  stale: z.boolean(),
  staleReason: z.string(),
});
export type PrivacyInventory = z.infer<typeof PrivacyInventory>;

export const ConsentState = z.enum(['no-consent', 'reject-optional', 'selected', 'accept-all']);
export const ConsentRun = z.object({
  state: ConsentState,
  selection: z.array(ConsentCategory),
  requests: z.array(ObservedRequest),
  cookies: z.array(StorageEntry),
  localStorage: z.array(StorageEntry),
  sessionStorage: z.array(StorageEntry),
  violations: z.array(z.string()),
  status: CheckStatus,
});
export type ConsentRun = z.infer<typeof ConsentRun>;

export const ConsentConfiguration = z.object({
  required: z.boolean(),
  categories: z.array(z.object({ key: ConsentCategory, label: z.string(), description: z.string(), services: z.array(z.string()) })),
  storageKey: z.string(),
  version: z.number(),
});
export type ConsentConfiguration = z.infer<typeof ConsentConfiguration>;
