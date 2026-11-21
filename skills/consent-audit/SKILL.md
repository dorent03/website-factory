---
name: consent-audit
description: Tests a website's cookie/consent behaviour in four fresh browser contexts — no interaction, reject all, selected categories, accept all — and fails any consent-dependent request, cookie or storage write before consent, decorative or non-functional banners, and banners that are not actually required. Load when a site has or might need a consent banner, embeds third-party content, or before release.
---

# Consent audit

Decides two things with evidence: (1) is a consent mechanism **required** at all, and (2) if present, does it **actually control** what loads. Which processing requires consent is defined in the Factory's `legal-rules/`; this skill never decides that from memory. Statuses: PASS / WARNING / FAIL / MANUAL REVIEW REQUIRED.

## Step 0 — Is a banner required?

1. Take the observed inventory from `privacy-audit` (or capture it: fresh context, all pages, scroll, open menus, click every click-to-load placeholder).
2. For each processing look up `consentRequired` via `legal-rules/`.
3. Outcome:
   - Nothing consent-requiring → **no banner**. A banner present anyway is a WARNING ("decorative banner": annoys users, implies tracking that does not exist) — recommend removal. A banner claiming categories (Statistik, Marketing) for tools that do not exist → FAIL (misleading).
   - Consent-requiring processing exists → a working consent mechanism is required → run states A–D.
   - Classification unclear → MANUAL REVIEW REQUIRED; still run A–D if a banner exists.
- Click-to-load placeholders (map, video) are per-item consent; they still must not contact the third party before the click — test them in state A.

## The four states

Each state uses a **brand-new browser context** (no cookies, storage, cache, service workers). Viewports: 390 px and 1440 px. Visit every page; scroll to bottom; wait for network idle + 3 s; reload once to catch post-reload behaviour.

| State | Action | Expected |
| --- | --- | --- |
| A — none | Load, do not touch the banner | Zero consent-dependent requests, cookies, storage. Banner visible, page content still usable and legal links reachable |
| B — reject | Click "Ablehnen"/"Nur notwendige" (must be on the first layer, as prominent as accept — check `legal-rules/`) | Same as A after the click and after reload; decision persisted only in a strictly-necessary key |
| C — selected | Open settings, enable exactly one category (repeat per category) | Only that category's hosts/cookies appear, only after the save click |
| D — accept all | Click "Alle akzeptieren" | All documented tools load after the click; nothing undocumented loads |

Per state record: requests (with timestamp relative to the consent click), `Set-Cookie`, `document.cookie`, `localStorage`/`sessionStorage`, iframes, and a screenshot of the banner/settings.

## Fail conditions

- Any request to a consent-dependent host, or consent-dependent cookie/storage write, **before** the corresponding consent (states A, B, C for non-selected categories) → FAIL. Include `preconnect`/`dns-prefetch` to those hosts and requests from `<noscript>`.
- Third-party scripts present in HTML as `<script src>` instead of being inserted only after consent (`type="text/plain" data-category` or equivalent) → FAIL if they execute before consent.
- Banner with no effect (tools load regardless of choice) → FAIL.
- Reject not available with equal effort on the first layer, pre-ticked categories, consent implied by scrolling/continuing to browse → FAIL (per `legal-rules/`).
- Banner covers Impressum/Datenschutz links or traps keyboard focus without a way out → FAIL.
- Withdrawal: no persistent "Cookie-Einstellungen" link (footer) that reopens settings → FAIL. After withdrawing, consent-dependent tools must stop on the next page load and their cookies should be removed where technically possible (WARNING if cookies remain).
- Consent tool itself loads from a third party before any choice → evaluate via `legal-rules/`; undocumented → FAIL.
- Category descriptions in the banner do not match actual tools → FAIL.
- Banner text claims "Wir verwenden Cookies, um Ihr Erlebnis zu verbessern" with nothing behind it → WARNING/FAIL per Step 0.

## Accessibility of the consent UI

- Keyboard reachable, visible focus, buttons are real `<button>`s with clear German labels, ≥ 4.5:1 contrast for both accept and reject, ≥ 24 px targets, works at 375 px and 200 % zoom, does not cause horizontal overflow (`responsive-quality-gate`).

## Factory implementation guidance (when a banner is required)

- Prefer a small self-hosted script over SaaS CMPs. Store only the decision (category booleans + version + timestamp) in a first-party key.
- Gate each third party behind the decision; map/video embeds use click-to-load placeholders with provider name, what is transmitted, and a link to the Datenschutz section.
- Version the consent: changing tools bumps the version and re-asks.

## Report

- Step 0 decision with the processing list and rule references.
- State matrix: state × (requests before/after, cookies, storage) with PASS/FAIL.
- Findings with evidence (HAR excerpt, request URL, timestamp vs click, screenshot path).
- Artifacts: one HAR and one cookie/storage dump per state and viewport.
