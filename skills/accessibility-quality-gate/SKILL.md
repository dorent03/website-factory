---
name: accessibility-quality-gate
description: WCAG 2.2 level AA release gate for static websites — automated axe scan plus manual keyboard, screen-reader-semantics, contrast, zoom/reflow, motion, forms and media checks, reported per success criterion as PASS/FAIL/MANUAL REVIEW REQUIRED. Load before release, after template or component changes, and when a customer may fall under accessibility obligations.
---

# Accessibility quality gate (WCAG 2.2 AA)

Target: WCAG 2.2 Level A + AA on every page. Whether the customer is legally obliged (e.g. BFSG) is decided via the Factory's `legal-rules/` in `german-website-compliance`; this gate runs regardless.

Automated tools find roughly a third of issues. A page cannot PASS on axe alone.

## 1. Automated scan

- axe-core with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` on every page at 390 px and 1440 px, plus in opened-menu, opened-dialog and form-error states.
- Any violation → FAIL with rule id, selector, help URL. `incomplete` results → MANUAL REVIEW REQUIRED until checked.

## 2. Manual checks by criterion

### Structure and semantics (1.3.1, 1.3.2, 2.4.1, 2.4.2, 2.4.6, 3.1.1, 4.1.2)
- [ ] `<html lang="de">`; foreign-language passages marked with `lang` (3.1.2).
- [ ] Unique, descriptive `<title>` per page ("Leistungen – Muster GmbH").
- [ ] Landmarks: `header`, `nav` (labelled if multiple), `main` (exactly one), `footer`.
- [ ] Exactly one `h1`; no skipped heading levels; headings describe sections.
- [ ] Skip link "Zum Inhalt springen" is the first focusable element and works.
- [ ] Lists are `ul/ol`, tables have `th` + `scope` + `caption`, `<address>` for contact data.
- [ ] Native elements used: `button` for actions, `a href` for navigation; no click handlers on `div`/`span`.
- [ ] Custom widgets expose correct role/name/state (`aria-expanded`, `aria-current`, `aria-pressed`).

### Keyboard (2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11)
- [ ] Every function operable with Tab/Shift+Tab/Enter/Space/Esc/arrows as the role expects.
- [ ] No keyboard trap; menus and dialogs close with Esc and return focus to their trigger.
- [ ] Focus order follows visual order; no positive `tabindex`.
- [ ] Focus always visible: ring ≥ 2 px, ≥ 3:1 against adjacent colours; never `outline: none` without replacement.
- [ ] Focused element not fully hidden by sticky header, consent banner or chat widget (2.4.11 Focus Not Obscured).

### Contrast and colour (1.4.1, 1.4.3, 1.4.11)
- [ ] Text ≥ 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) ≥ 3:1 — measured numbers, both themes if dark mode exists.
- [ ] Text on images/gradients measured at lightest and darkest area, or a scrim added.
- [ ] UI component boundaries, icons conveying meaning and focus indicators ≥ 3:1.
- [ ] Colour never the only signal (links in text underlined or ≥ 3:1 to body text plus non-colour cue on hover/focus; errors have text/icon).

### Resize, reflow, spacing (1.4.4, 1.4.10, 1.4.12, 1.3.4)
- [ ] 200 % browser zoom: no loss of content or function.
- [ ] 320 px width: single column, no horizontal scroll (except maps/tables in labelled scroll regions).
- [ ] Text-spacing override (line-height 1.5, paragraph 2em, letter 0.12em, word 0.16em): nothing clipped or overlapping.
- [ ] No orientation lock; viewport meta does not block zoom (`user-scalable=no`, `maximum-scale=1` → FAIL).

### Pointer and targets (2.5.3, 2.5.7, 2.5.8)
- [ ] Targets ≥ 24 × 24 CSS px or adequately spaced (inline text links exempt).
- [ ] Visible label text is contained in the accessible name (2.5.3 Label in Name).
- [ ] Drag-only interactions have a single-pointer alternative.

### Images and media (1.1.1, 1.2.x, 1.4.2)
- [ ] Informative images: `alt` describes content/purpose in German; decorative: `alt=""`; logo alt = company name; image links describe the destination.
- [ ] Inline SVG icons `aria-hidden="true"`; meaningful SVG `role="img"` + name.
- [ ] Prerecorded video with speech: captions (1.2.2); audio-only: transcript; audio description or text alternative where content is visual-only (1.2.5).
- [ ] No autoplaying audio; autoplaying motion > 5 s can be paused (2.2.2).

### Motion and flashing (2.3.1, 2.2.2, 2.3.3 best practice)
- [ ] Nothing flashes > 3 times per second.
- [ ] Carousels/auto-animations have pause; `prefers-reduced-motion: reduce` removes non-essential movement.

### Forms (1.3.5, 3.3.1, 3.3.2, 3.3.3, 3.3.7, 3.3.8, 4.1.3)
- [ ] Every field has a visible `<label>`; placeholder never the only label; required fields indicated in text.
- [ ] `autocomplete` tokens on personal data fields (`name`, `email`, `tel`, `street-address`, `postal-code`).
- [ ] Errors identified in text, linked via `aria-describedby`, field gets `aria-invalid="true"`; suggestion how to fix.
- [ ] On submit failure focus moves to first invalid field or an error summary.
- [ ] Success/error status announced (`role="status"`/`role="alert"`).
- [ ] No re-entering of already provided data in multi-step forms (3.3.7); no cognitive-test CAPTCHA without alternative (3.3.8).

### Consistency and help (3.2.3, 3.2.4, 3.2.6)
- [ ] Navigation in the same order on every page; same functions labelled identically.
- [ ] Contact/help mechanism (phone, email, contact link) in the same relative place on every page (3.2.6 Consistent Help).

### Content on hover/focus (1.4.13)
- [ ] Tooltips/dropdowns dismissable (Esc), hoverable, persistent until dismissed.

## 3. Screen-reader smoke test

VoiceOver (macOS) or NVDA: navigate by headings and landmarks, open/close the mobile menu, complete the contact form with one error, trigger a click-to-load embed and the consent banner. Record what was announced; anything unlabelled, misread or silent → FAIL.

## Status rules

- FAIL: any axe violation, any failed manual check.
- MANUAL REVIEW REQUIRED: checks that need human judgement (alt-text quality, caption accuracy, cognitive load) not yet signed off.
- PASS: all criteria checked with evidence.

## Report

Table by success criterion (number, name, level, status, evidence: page, selector, screenshot or measured value, fix). End with "Tested: browsers, viewports, AT used; Not tested: …". Never write "barrierefrei" or "fully accessible" — write "No WCAG 2.2 AA failures found in the tested scope".

Reference material: Factory repo `skills/third-party/frontend-ui/references/accessibility.md` (patterns) and `skills/vendored/flitzrrr-frontend-design-skills/accessibility/` (note: that source targets WCAG 2.1 and cites 44 px targets; this gate's 2.2 AA rules take precedence).
