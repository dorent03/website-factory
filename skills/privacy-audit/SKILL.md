---
name: privacy-audit
description: Runtime-first privacy audit of a built static website — compares source code, rendered DOM, network requests, cookies, web storage, forms, the privacy inventory, the Datenschutzerklärung and consent behaviour, and reports every mismatch. Load after a build and before release, whenever third-party resources, forms or embeds change, or when generating/checking the Datenschutzerklärung.
---

# Privacy audit

**Runtime behaviour is the source of truth.** Source code, config and the Datenschutzerklärung are claims; the browser's network log, cookie jar and storage are facts. Every claim is checked against the facts.

Legal evaluation (what needs consent, what must be disclosed) is delegated to the Factory's `legal-rules/`. This skill produces the evidence and the mismatch list. Statuses: PASS / WARNING / FAIL / MANUAL REVIEW REQUIRED (as in `german-website-compliance`).

## Inputs

- Built site directory and a local static server URL (serve exactly what will be uploaded via FTP).
- `privacy-inventory.json` (what the site is supposed to process; schema below).
- Datenschutzerklärung page URL.

## Procedure

### 1. Source scan (claims)
- Grep all HTML/CSS/JS/JSON/SVG for absolute URLs and protocol-relative `//` URLs: `src`, `href`, `srcset`, `action`, `url(...)`, `@import`, `fetch(`, `XMLHttpRequest`, `navigator.sendBeacon`, `new WebSocket`, `<link rel=preconnect|dns-prefetch|preload>`.
- Flag inline third-party snippets (gtag, fbq, `_paq`, hotjar, clarity), iframes, `<form action>` targets, `mailto:` / `tel:`.
- Flag `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB` writes in first-party JS.

### 2. Runtime capture (facts)
Use Playwright (or the Factory's browser tool) with a **fresh context per run** (no cache, no storage):
- Load every page at 1440 px and 390 px. Wait for network idle + 3 s. Scroll to bottom slowly to trigger lazy loads. Open the mobile menu. Focus/hover nothing else.
- Record: every request (URL, method, initiator, resource type, status, request headers incl. `Referer`), every response `Set-Cookie`, `document.cookie`, all `localStorage`/`sessionStorage` keys, service-worker registrations.
- Repeat the capture for the consent states defined in `consent-audit` if a consent tool exists.
- Submit each form once with test data on a local/test handler; record where data is sent.

### 3. Rendered DOM
- Compare rendered DOM against source: scripts injected at runtime, iframes created by JS, tracking pixels (`<img width=1 height=1>`), `<noscript>` pixels.

### 4. Build the observed inventory
For each distinct third-party host and each cookie/storage key: host or name, first seen page, initiator, before/after consent, purpose (if known), data sent (IP always; plus query params, referrer, form data).

### 5. Compare

| Compare | Mismatch → |
| --- | --- |
| Observed host not in `privacy-inventory.json` | FAIL |
| Inventory entry never observed and not consent-gated | WARNING (stale entry) |
| Observed processing not described in Datenschutzerklärung | FAIL |
| Datenschutzerklärung describes processing that never occurs | WARNING |
| Cookie/storage set before consent that `legal-rules/` classifies as consent-requiring | FAIL |
| Request to consent-dependent host before consent | FAIL |
| Form data sent to a host not in the inventory | FAIL |
| Source references a host that runtime never contacts (dead code) | WARNING — remove |
| Runtime contacts a host not visible in source (injected) | FAIL until explained |
| `Referer` leaks full URLs with personal data in query strings | FAIL |
| Classification unclear in `legal-rules/` | MANUAL REVIEW REQUIRED |

### 6. Factory defaults (expected outcome for a standard site)
- Zero third-party requests in the no-consent state.
- Zero cookies and zero storage keys in the no-consent state, except ones `legal-rules/` classifies as strictly necessary and the Datenschutz describes (e.g. storing the consent decision itself).
- Fonts, icons, scripts served from the site origin.
- Form posts only to the documented handler over HTTPS.

## `privacy-inventory.json` schema

```json
{
  "site": "example-handwerk.de",
  "updatedAt": "2026-11-02T10:00:00Z",
  "processings": [
    {
      "id": "contact-form",
      "kind": "form | hosting | font | map | video | analytics | consent-tool | email | other",
      "provider": "Site host (customer's FTP host)",
      "hosts": ["example-handwerk.de"],
      "dataCategories": ["Name", "E-Mail", "Nachricht", "IP-Adresse"],
      "purpose": "Bearbeitung von Anfragen",
      "consentRequired": false,
      "ruleRef": "legal-rules/<file>#<anchor>",
      "cookies": [],
      "storageKeys": [],
      "datenschutzSection": "#kontaktformular"
    }
  ]
}
```

`consentRequired` is set from `legal-rules/`, never guessed; if no rule matches, set `null` and report MANUAL REVIEW REQUIRED.

## Report

1. Observed inventory table (host/cookie → page, state, initiator).
2. Mismatch findings (status, evidence: request URL + page + state, or selector + excerpt; fix).
3. Diff summary: inventory vs runtime vs Datenschutz.
4. Artifacts: HAR file per state, cookie/storage JSON per state, screenshots of consent UI.
5. Never conclude "DSGVO-konform"; conclude "No mismatches found between runtime behaviour, inventory and Datenschutzerklärung in the tested states" or list blockers.
