import type { ConsentCategory, ServiceCategory } from '@wf/shared';

export interface KnownService {
  key: string;
  /** Provider family: subresources a consented embed loads from sibling hosts of the same provider. */
  family?: string;
  name: string;
  provider: string;
  hosts: RegExp[];
  category: ServiceCategory;
  consentCategory: ConsentCategory;
  /** Key in legal-rules/germany/datenschutz-sections.json */
  sectionKey: string;
  consentRequired: boolean;
  purpose: string;
  data: string[];
}

/** Third-party services the inventory can recognise. Anything not matched is an unknown (undeclared) origin. */
export const KNOWN_SERVICES: KnownService[] = [
  { key: 'youtube', family: 'google', name: 'YouTube', provider: 'Google Ireland Ltd. / Google LLC', hosts: [/(^|\.)youtube(-nocookie)?\.com$/, /(^|\.)ytimg\.com$/, /(^|\.)googlevideo\.com$/, /^youtu\.be$/], category: 'external-media', consentCategory: 'external-media', sectionKey: 'youtube', consentRequired: true, purpose: 'Einbettung von Videos', data: ['IP-Adresse', 'Geräteinformationen', 'Nutzungsdaten'] },
  { key: 'vimeo', family: 'vimeo', name: 'Vimeo', provider: 'Vimeo.com Inc.', hosts: [/(^|\.)vimeo\.com$/, /(^|\.)vimeocdn\.com$/], category: 'external-media', consentCategory: 'external-media', sectionKey: 'vimeo', consentRequired: true, purpose: 'Einbettung von Videos', data: ['IP-Adresse', 'Geräteinformationen', 'Nutzungsdaten'] },
  { key: 'google-maps', family: 'google', name: 'Google Maps', provider: 'Google Ireland Ltd. / Google LLC', hosts: [/^maps\.(googleapis|google|gstatic)\.com$/, /^(www\.)?google\.[a-z.]+$/], category: 'maps', consentCategory: 'external-media', sectionKey: 'google-maps', consentRequired: true, purpose: 'Kartendarstellung', data: ['IP-Adresse', 'Standortbezogene Daten'] },
  { key: 'openstreetmap', name: 'OpenStreetMap', provider: 'OpenStreetMap Foundation', hosts: [/(^|\.)openstreetmap\.org$/, /(^|\.)tile\.openstreetmap\.org$/], category: 'maps', consentCategory: 'external-media', sectionKey: 'openstreetmap', consentRequired: true, purpose: 'Kartendarstellung', data: ['IP-Adresse'] },
  { key: 'google-fonts', name: 'Google Fonts', provider: 'Google Ireland Ltd. / Google LLC', hosts: [/^fonts\.(googleapis|gstatic)\.com$/], category: 'fonts', consentCategory: 'external-media', sectionKey: 'google-fonts', consentRequired: true, purpose: 'Schriftarten von Google-Servern', data: ['IP-Adresse'] },
  { key: 'adobe-fonts', name: 'Adobe Fonts', provider: 'Adobe Inc.', hosts: [/^use\.typekit\.net$/, /^p\.typekit\.net$/], category: 'fonts', consentCategory: 'external-media', sectionKey: 'adobe-fonts', consentRequired: true, purpose: 'Schriftarten von Adobe-Servern', data: ['IP-Adresse'] },
  { key: 'google-analytics', name: 'Google Analytics', provider: 'Google Ireland Ltd. / Google LLC', hosts: [/(^|\.)google-analytics\.com$/, /(^|\.)googletagmanager\.com$/, /(^|\.)analytics\.google\.com$/], category: 'analytics', consentCategory: 'analytics', sectionKey: 'analytics', consentRequired: true, purpose: 'Reichweitenmessung', data: ['IP-Adresse', 'Nutzungsdaten', 'Geräte-IDs'] },
  { key: 'meta', name: 'Meta (Facebook/Instagram)', provider: 'Meta Platforms Ireland Ltd.', hosts: [/(^|\.)facebook\.(com|net)$/, /(^|\.)fbcdn\.net$/, /(^|\.)instagram\.com$/, /(^|\.)cdninstagram\.com$/], category: 'social', consentCategory: 'marketing', sectionKey: 'social-embeds', consentRequired: true, purpose: 'Social-Media-Einbindung / Tracking', data: ['IP-Adresse', 'Nutzungsdaten'] },
  { key: 'tiktok', name: 'TikTok', provider: 'TikTok Technology Ltd.', hosts: [/(^|\.)tiktok(cdn)?\.com$/], category: 'social', consentCategory: 'marketing', sectionKey: 'social-embeds', consentRequired: true, purpose: 'Social-Media-Einbindung', data: ['IP-Adresse', 'Nutzungsdaten'] },
  { key: 'recaptcha', name: 'Google reCAPTCHA', provider: 'Google Ireland Ltd. / Google LLC', hosts: [/^(www\.)?recaptcha\.net$/, /^www\.google\.com$/, /^www\.gstatic\.com$/], category: 'captcha', consentCategory: 'necessary', sectionKey: 'captcha', consentRequired: true, purpose: 'Spam-Schutz', data: ['IP-Adresse', 'Verhaltensdaten'] },
  { key: 'hcaptcha', name: 'hCaptcha', provider: 'Intuition Machines Inc.', hosts: [/(^|\.)hcaptcha\.com$/], category: 'captcha', consentCategory: 'necessary', sectionKey: 'captcha', consentRequired: true, purpose: 'Spam-Schutz', data: ['IP-Adresse'] },
  { key: 'jsdelivr', name: 'jsDelivr CDN', provider: 'Prospect One / Cloudflare / Fastly', hosts: [/(^|\.)jsdelivr\.net$/], category: 'cdn', consentCategory: 'necessary', sectionKey: 'cdn', consentRequired: false, purpose: 'Auslieferung von Bibliotheken', data: ['IP-Adresse'] },
  { key: 'cdnjs', name: 'cdnjs (Cloudflare)', provider: 'Cloudflare Inc.', hosts: [/^cdnjs\.cloudflare\.com$/], category: 'cdn', consentCategory: 'necessary', sectionKey: 'cdn', consentRequired: false, purpose: 'Auslieferung von Bibliotheken', data: ['IP-Adresse'] },
  { key: 'unpkg', name: 'unpkg CDN', provider: 'Cloudflare Inc.', hosts: [/^unpkg\.com$/], category: 'cdn', consentCategory: 'necessary', sectionKey: 'cdn', consentRequired: false, purpose: 'Auslieferung von Bibliotheken', data: ['IP-Adresse'] },
];

const FAMILIES: Record<string, RegExp[]> = {
  google: [/(^|\.)gstatic\.com$/, /(^|\.)googleapis\.com$/, /(^|\.)ggpht\.com$/, /(^|\.)googleusercontent\.com$/, /(^|\.)google\.[a-z.]+$/, /(^|\.)doubleclick\.net$/, /(^|\.)googlevideo\.com$/, /(^|\.)ytimg\.com$/, /(^|\.)youtube(-nocookie)?\.com$/],
  vimeo: [/(^|\.)vimeo\.com$/, /(^|\.)vimeocdn\.com$/, /(^|\.)akamaized\.net$/],
};

/** Hosts belonging to a provider family (used only to attribute subresources after consent was given). */
export function familyOf(origin: string): string | null {
  let host = '';
  try { host = new URL(origin).hostname; } catch { return null; }
  for (const [f, res] of Object.entries(FAMILIES)) if (res.some((re) => re.test(host))) return f;
  return null;
}

export function matchService(origin: string): KnownService | null {
  let host = '';
  try { host = new URL(origin).hostname; } catch { return null; }
  return KNOWN_SERVICES.find((s) => s.hosts.some((re) => re.test(host))) ?? null;
}
