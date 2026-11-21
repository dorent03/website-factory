---
name: local-business-seo
description: Local SEO for static German small-business websites — NAP consistency, honest location and service-area pages, titles/meta/headings, Schema.org LocalBusiness JSON-LD built only from verified facts, sitemap/robots/canonical, and redirects from an old site. Load when writing page metadata, structured data, location/service pages, or preparing a relaunch.
---

# Local business SEO

Honest relevance for real searches in the real service area. No tricks that misrepresent the business.

## Hard rules

- **Verified facts only.** Name, address, phone, opening hours, geo coordinates, price range, ratings in Schema.org or meta come from VERIFIED fields (`company-fact-verification`). Missing → omit the property; never placeholder values in JSON-LD.
- **No fake locations.** No pages or markup implying offices, branches or addresses the business does not have. Service-area pages ("Elektriker in Nachbarstadt") are allowed only if the business really serves that area, and must say the business is based elsewhere ("Wir kommen aus Musterstadt zu Ihnen nach Nachbarstadt"). No virtual-office or invented addresses.
- **No doorway pages:** each location/service page has substantively unique, useful content (local specifics, real projects, travel/arrival info) — not a city-name swap. Template-with-city-swap → FAIL.
- **No fake reviews or ratings.** `aggregateRating`/`review` markup only for reviews collected on the site itself with verifiable source; never copy Google ratings into markup.
- No keyword stuffing, hidden text, or invisible location lists in the footer.

## NAP consistency

- Name, Address, Phone identical in: Impressum, footer, contact page, JSON-LD, Google Business Profile (customer to confirm), and directory listings the customer controls.
- One canonical format per site: legal or brand name as agreed; `Musterstraße 12, 12345 Musterstadt`; phone visible `+49 30 1234567` and `tel:+49301234567`.
- Automated check: extract all NAP occurrences from the built HTML + JSON-LD; any variant after normalisation → FAIL.

## On-page

| Element | Rule |
| --- | --- |
| `<title>` | Unique per page, ≤ 60 chars, `Leistung + Ort – Marke` on service pages, brand last |
| Meta description | Unique, ≤ 155 chars, concrete offer + area + call to action; no superlatives |
| `h1` | One per page, matches search intent ("Badsanierung in Musterstadt") |
| Headings | Logical outline; services and areas as `h2`/`h3` with real content |
| URLs | Short, German, ASCII-transliterated: `/leistungen/badsanierung/` |
| Internal links | Every service page linked from navigation or services overview; descriptive anchor text |
| Images | Descriptive German filenames (`badsanierung-musterstadt-dusche.webp`) and alt text that describes the image, not keyword lists |
| Language | `lang="de"`; `hreflang` only if real language versions exist |
| Contact | Phone and address as crawlable text on every page (footer) |

## Schema.org JSON-LD

- One `LocalBusiness` (or most specific subtype: `Plumber`, `Electrician`, `Dentist`, `Restaurant`, `LegalService` …) on the home page; reference it by `@id` elsewhere.
- Include only verified properties. Minimal example:

```json
{
  "@context": "https://schema.org",
  "@type": "Plumber",
  "@id": "https://www.example-sanitaer.de/#business",
  "name": "Muster Sanitär GmbH",
  "url": "https://www.example-sanitaer.de/",
  "telephone": "+49301234567",
  "email": "info@example-sanitaer.de",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Musterstraße 12",
    "postalCode": "12345",
    "addressLocality": "Musterstadt",
    "addressCountry": "DE"
  },
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "08:00", "closes": "17:00" }
  ],
  "areaServed": [{ "@type": "City", "name": "Musterstadt" }]
}
```

- `geo` only from a verified source (customer or geocoded verified address), ≤ 5 decimals.
- `sameAs` only for profiles confirmed to belong to the customer.
- Service-area businesses without public premises: follow Google's guidance — omit street address if the customer does not want it public, use `areaServed`.
- Validate with a Schema.org validator / Rich Results test; JSON-LD must match visible page content.
- `BreadcrumbList` on subpages; `FAQPage` only if the FAQ is visible on the page.

## Technical

- `sitemap.xml` with all indexable pages (absolute HTTPS URLs, `lastmod`), referenced in `robots.txt`.
- `robots.txt` does not block CSS/JS/images. Impressum/Datenschutz stay crawlable (may be `noindex` if the customer wishes, but must remain linkable).
- `<link rel="canonical">` on every page with the preferred host (www or non-www, HTTPS); consistent trailing slashes.
- Relaunch: map every old URL → new URL; 301 redirects (`.htaccess` on Apache hosts) for all changed URLs; no redirect chains; verify each old URL after upload.
- Performance basics feed rankings: see `static-site-quality` (LCP image preloaded, CLS ≈ 0).
- Open Graph tags (`og:title`, `og:description`, `og:image` with a rights-cleared image, `og:locale=de_DE`).

## Checklist

- [ ] NAP identical everywhere (automated diff clean).
- [ ] JSON-LD contains only VERIFIED values and validates; matches visible content.
- [ ] No fake locations, doorway pages, fake ratings, hidden text.
- [ ] Unique title/description/h1 per page.
- [ ] sitemap.xml, robots.txt, canonical correct; old URLs redirected (301) and tested.
