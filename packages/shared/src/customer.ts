import { z } from 'zod';
import { FactStatus } from './status.ts';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const Slug = z.string().regex(SLUG_RE, 'invalid slug');

const opt = z.string().trim().max(500).default('');

export const Address = z.object({ street: opt, postalCode: opt, city: opt, country: z.string().trim().max(80).default('Deutschland') });
export type Address = z.infer<typeof Address>;

/** Marketing information: may be shaped for presentation. */
export const MarketingProfile = z.object({
  companyName: z.string().trim().min(1).max(200),
  industry: opt,
  website: opt,
  phone: opt,
  email: opt,
  contactPerson: opt,
  address: Address.default({ street: '', postalCode: '', city: '', country: 'Deutschland' }),
  openingHours: opt,
  services: z.array(z.string().trim().max(200)).max(60).default([]),
  serviceArea: opt,
  socialMedia: z.array(z.object({ network: z.string().max(40), url: z.string().max(500) })).max(20).default([]),
  logoAssetId: opt,
  brandColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(12).default([]),
  notes: z.string().max(5000).default(''),
});
export type MarketingProfile = z.infer<typeof MarketingProfile>;

export const LEGAL_FORMS = ['Einzelunternehmen', 'e.K.', 'GbR', 'OHG', 'KG', 'GmbH & Co. KG', 'GmbH', 'UG (haftungsbeschränkt)', 'AG', 'e.V.', 'PartG', 'PartG mbB', 'Freiberufler', 'Sonstige'] as const;

/** Legal information: exact, sourced, never invented. Field names match legal-rules requiredFields. */
export const LegalProfile = z.object({
  legalName: opt,
  legalForm: opt,
  street: opt,
  postalCode: opt,
  city: opt,
  country: z.string().trim().max(80).default('Deutschland'),
  email: opt,
  phone: opt,
  representatives: z.array(z.string().trim().max(200)).max(20).default([]),
  registerCourt: opt,
  registerNumber: opt,
  vatId: opt,
  economicId: opt,
  supervisoryAuthority: opt,
  chamber: opt,
  professionalTitle: opt,
  professionalTitleCountry: opt,
  professionalRules: opt,
  editorialResponsible: opt,
  isCommercial: z.boolean().default(true),
  isRegulatedProfession: z.boolean().default(false),
  sellsToConsumers: z.boolean().default(false),
  hasJournalisticContent: z.boolean().default(false),
  employeeCountBand: z.enum(['unknown', 'lt10', '10to49', '50plus']).default('unknown'),
  /** Per-field verification state as confirmed by a human or research. */
  verification: z.array(z.object({ field: z.string(), status: FactStatus, factIds: z.array(z.string()).default([]), confirmedByUser: z.boolean().default(false) })).default([]),
});
export type LegalProfile = z.infer<typeof LegalProfile>;

export const LEGAL_FIELDS = ['legalName', 'legalForm', 'street', 'postalCode', 'city', 'country', 'email', 'phone', 'representatives', 'registerCourt', 'registerNumber', 'vatId', 'economicId', 'supervisoryAuthority', 'chamber', 'professionalTitle', 'professionalTitleCountry', 'professionalRules', 'editorialResponsible'] as const;
export type LegalField = (typeof LEGAL_FIELDS)[number];

export const CustomerInput = z.object({ marketing: MarketingProfile, legal: LegalProfile.default(LegalProfile.parse({})) });
export type CustomerInput = z.infer<typeof CustomerInput>;

export interface Customer extends CustomerInput {
  id: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}
