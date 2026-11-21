---
name: german-business-websites
description: Conventions for static websites of German small and mid-sized businesses (Handwerk, Praxis, Kanzlei, Gastronomie, Einzelhandel, Dienstleister) — page set, German copy and formatting, contact and opening-hours patterns, trust content, forms on FTP hosting, and what must never be invented. Load when planning, writing or building any customer site in the Website Factory.
---

# German business websites

Applies to every site the Factory builds. Legal requirements are NOT restated here — they live in the Factory's `legal-rules/` and are enforced by `german-website-compliance`. This skill covers structure, language and content conventions.

## Inputs you must have before building

- Verified company facts (from `company-fact-verification`): legal name, legal form, address, phone, email, opening hours, services, service area. Anything not VERIFIED is shown as a placeholder `[[FEHLT: Feld]]` and listed in the handover — never filled with plausible-looking data.
- Site type (one-pager, multi-page, landing page) and the primary conversion goal (Anruf, Anfrage-Formular, Terminbuchung, Besuch vor Ort).
- Hosting constraints: static files via FTP. Confirm whether PHP is available before choosing a form handler.

## Default page set

| Page | Path | Required content |
| --- | --- | --- |
| Startseite | `/` | What, where, for whom in the first viewport; primary CTA; key services; contact block |
| Leistungen | `/leistungen/` (or sections) | One block per service with concrete description; no filler |
| Über uns | `/ueber-uns/` | Verified history, team (real people only, with consent), qualifications that are verified |
| Kontakt | `/kontakt/` | Address, phone (`tel:`), email (`mailto:`), opening hours, directions, form if agreed |
| Impressum | `/impressum/` | Content per `legal-rules/`; never invented — see `german-website-compliance` |
| Datenschutz | `/datenschutz/` | Generated from the site's actual privacy inventory — see `privacy-audit` |

- One-pagers still need separate Impressum and Datenschutz pages (or clearly labelled, directly linkable sections — follow `legal-rules/`).
- URL slugs: lowercase ASCII, umlauts transliterated (`ue`, `oe`, `ae`, `ss`), hyphens, trailing slash consistent site-wide.
- Footer on every page: Impressum, Datenschutz, (Cookie-Einstellungen only if a consent tool exists), contact essentials.

## Language and tone

- `<html lang="de">`. Formal "Sie" by default; "du" only if the customer explicitly uses it in their brand.
- Correct German typography: „Anführungszeichen" (U+201E / U+201C), Gedankenstrich – with spaces, Bis-Strich without spaces (`8–17 Uhr`), non-breaking space between number and unit (`30 km`, `25 €`).
- Never strip or transliterate umlauts/ß in visible text. Verify the font has all glyphs.
- Concrete, regional, factual copy: "Heizungsbau in Musterstadt und 30 km Umkreis" beats "Ihr kompetenter Partner für innovative Lösungen". Ban list: "innovativ", "ganzheitlich", "kompetenter Partner", "Lösungen" without object, "Herzlich willkommen auf unserer Website".
- Use gendered/neutral forms as the customer prefers; be consistent within the site.
- No superlatives or claims that cannot be proven ("der beste Bäcker der Stadt", "Nr. 1", "günstigster") — misleading advertising risk; see `legal-rules/`.

## Formatting conventions

| Item | Format |
| --- | --- |
| Date | `2. November 2026` or `02.11.2026` |
| Time | `8:00 Uhr`, ranges `8:00–17:00 Uhr` |
| Opening hours | `Mo–Fr 8:00–17:00 Uhr`, `Sa 9:00–13:00 Uhr`, `So und feiertags geschlossen` |
| Numbers | `1.234,56` |
| Prices | `49,00 €` (amount, NBSP, €); state whether incl. MwSt. per `legal-rules/` |
| Phone (visible) | `+49 30 1234567` or `030 1234567`; link `href="tel:+49301234567"` |
| Address | Street No., `PLZ Ort` on its own line, inside `<address>` |

## Trust content — rules

- Testimonials/reviews: only real ones with source and the customer's permission. No invented quotes, no star ratings without a verifiable source, no "Kundenstimmen" placeholders left in production.
- Certificates, Meisterbrief, memberships (Handwerkskammer, Innung, Kammer), awards: only if VERIFIED; show the official logo only if the customer is entitled to use it.
- Years in business, number of customers/projects: only verified figures; otherwise omit.
- Team photos and names: real employees only, with documented consent. Stock people are never presented as staff (`asset-rights-audit`).
- Regulated professions (Ärzte, Anwälte, Steuerberater, Architekten …) have extra mandatory information and advertising limits — flag MANUAL REVIEW REQUIRED and follow `legal-rules/`.

## Contact and conversion

- Phone number clickable and visible in the first viewport on mobile for call-driven businesses.
- Email as `mailto:` link; if obfuscation is used it must stay accessible (no image-only emails).
- Opening hours as text (not an image), also in Schema.org (`local-business-seo`).
- Directions: text description + link to a map service. Embedded maps only via a consent-gated or click-to-load pattern (`german-website-compliance` → maps).

## Forms on static hosting

- Decide the handler explicitly and record it in the privacy inventory: (a) PHP mail script on the customer's host, (b) `mailto:` fallback, (c) third-party form service — (c) only with a documented processor and Datenschutz entry.
- Collect only what is needed (Name, Kontaktweg, Nachricht). Mark required fields; no hidden tracking fields.
- Link to the Datenschutzerklärung next to the submit button. Consent checkboxes only where `legal-rules/` requires them — never pre-ticked.
- Spam protection without third-party CAPTCHA by default: honeypot field + server-side time check. reCAPTCHA/hCaptcha/Turnstile need consent analysis.
- Server-side validation and a clear success/error page; the form must work without JavaScript.

## Technical baseline

- Plain HTML/CSS/JS, relative or root-relative links that work from the FTP document root; no build-time-only paths.
- All assets local: fonts, icons, scripts, images. No CDN unless documented in the privacy inventory.
- `.htaccess` only if the host is Apache and the customer confirms; HTTPS redirect and caching headers documented in handover.
- Must pass `static-site-quality`, `responsive-quality-gate`, `accessibility-quality-gate`, `german-website-compliance`.

## Checklist

- [ ] All company facts VERIFIED or visibly marked `[[FEHLT: …]]` and listed in handover.
- [ ] Page set complete; Impressum and Datenschutz linked in every footer.
- [ ] `lang="de"`, German quotes/dashes/number formats correct, umlauts intact.
- [ ] No unverifiable claims, fake reviews, stock "employees" or unearned badges.
- [ ] Phone/email/address clickable and consistent everywhere (NAP — see `local-business-seo`).
- [ ] Form handler decided, documented, works without JS, no unnecessary fields.
- [ ] No external requests without an entry in the privacy inventory.
