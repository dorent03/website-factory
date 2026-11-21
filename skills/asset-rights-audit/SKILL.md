---
name: asset-rights-audit
description: Classifies the rights status of every asset on a website — images, logos, icons, fonts, video, audio, illustrations, texts, third-party code — as customer-supplied, generated, licensed stock, open license or unknown, records licence evidence and credit requirements, sends unknowns to MANUAL REVIEW, and forbids presenting stock or generated people as employees. Load when assets are added and before release.
---

# Asset rights audit

Every file shown or loaded by the site has a documented right to be used. Legal evaluation of licences or image rights is delegated to the Factory's `legal-rules/`; this skill records evidence and applies the rules below. Statuses: PASS / WARNING / FAIL / MANUAL REVIEW REQUIRED.

## Asset inventory (`assets/rights.json`)

```json
{
  "path": "assets/img/team-werkstatt.webp",
  "kind": "photo | logo | icon | illustration | font | video | audio | text | code",
  "category": "customer-supplied | generated | licensed-stock | open-license | unknown",
  "origin": "Customer upload 2026-10-30 (email from owner)",
  "author": "…",
  "licence": "e.g. 'Customer confirms ownership', 'Adobe Stock Standard', 'CC BY 4.0', 'SIL OFL 1.1', 'Unsplash License'",
  "licenceUrl": "https://…",
  "licenceEvidence": "path/to/receipt-or-confirmation.pdf",
  "creditRequired": "text and placement, or null",
  "depictsPeople": true,
  "peopleConsent": "documented | not-needed | missing | unknown",
  "depictsThirdPartyMarks": false,
  "presentedAs": "Team der Muster GmbH | illustrative | product | decorative",
  "status": "PASS | WARNING | FAIL | MANUAL REVIEW REQUIRED",
  "notes": ""
}
```

Every file in the deploy folder (`assets/`, favicons, OG image, fonts, inline SVG sprites, CSS background images, video posters) has an entry. Missing entry → FAIL.

## Category rules

| Category | Required evidence | Default status |
| --- | --- | --- |
| customer-supplied | Customer's written confirmation that they hold the rights (own photos, commissioned work with usage rights) | PASS with confirmation; WARNING if only "sent by customer" without confirmation |
| generated | Tool/model, prompt reference, date; tool terms allow commercial use | PASS for abstract/illustrative; see people and marks rules |
| licensed-stock | Licence type, licence ID/receipt, licensee (customer or Factory with transfer), permitted use covers web + commercial | PASS with receipt; FAIL without |
| open-license | Exact licence (CC0, CC BY, CC BY-SA, OFL, Apache, MIT, Unsplash/Pexels licence), source URL, author; attribution obligations fulfilled; NC/ND licences generally incompatible with commercial sites | PASS if obligations met; FAIL if NC on commercial site or attribution missing |
| unknown | — | **MANUAL REVIEW REQUIRED** — not publishable until resolved |

Assets taken from the customer's old website, Google results, social media or competitor sites are `unknown` until the customer confirms ownership.

## People

- **Never present stock or generated people as employees, owners, customers or the customer's premises.** Captions, alt text, headings ("Unser Team"), placement in "Über uns" or next to staff names all count as presenting. Violation → FAIL.
- Stock/generated people may appear only as clearly illustrative imagery in neutral context (e.g. a generic service illustration), never in testimonials or team sections.
- Real employees/customers shown: documented consent per person (`peopleConsent: documented`); otherwise MANUAL REVIEW REQUIRED per `legal-rules/`.
- No generated images imitating real identifiable people.

## Generated assets

- Must not contain fake logos, legible fake text, certificates, seals, awards, or depictions of the customer's actual premises/products that do not exist ("our workshop" rendered by AI → FAIL).
- No generated images in the style of a named living artist or reproducing third-party characters/marks.
- Mark internally as generated; disclose on the page where `legal-rules/` requires.

## Logos and trademarks

- Customer logo: customer-supplied, highest-resolution vector preferred.
- Third-party logos (payment providers, partners, certifications, Kammer/Innung, review platforms): only with entitlement (membership, partner program terms) and in the owner's brand guidelines; otherwise remove → FAIL if kept.
- No Apple/Google/other brand assets as decoration (see `apple-inspired-web-design`).

## Fonts and icons

- Fonts: licence must allow web embedding and self-hosting (OFL, Apache, or a documented commercial web licence covering this domain). Desktop-only licences, Apple system fonts (SF Pro/New York) → FAIL.
- Icon sets: record licence (e.g. MIT, ISC, CC BY 4.0 → attribution). Copy icons into the project; no icon CDN.

## Texts and code

- Copy is written for the customer; no copied text from competitors or the web. Text reused from the customer's old site requires their confirmation.
- Third-party JS/CSS: licence recorded; MIT/BSD/Apache notices preserved in a `licenses.txt` or file header.

## Credits

- Where a licence requires attribution, place credits as required (image caption, footer, or a "Bildnachweise" section, e.g. on the Impressum page — per `legal-rules/`). Verify they are visible on the live page.

## Procedure

1. List every file in the deploy folder plus external media; diff against `assets/rights.json`.
2. Classify, attach evidence, set status.
3. Check people/presentation rules by inspecting where each image appears (page, section heading, caption, alt text).
4. Report: table by status; MANUAL REVIEW items as questions for the customer; FAIL items with fix (replace, obtain licence, remove, add credit).

## Gate

- [ ] Every deployed asset has an entry; no `unknown` left unresolved.
- [ ] No stock/generated people presented as staff, customers or premises.
- [ ] All attribution obligations visible on the site.
- [ ] Fonts and icons licensed for web, self-hosted.
- [ ] No unentitled third-party logos.
