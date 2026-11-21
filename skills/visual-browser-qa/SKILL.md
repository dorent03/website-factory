---
name: visual-browser-qa
description: Structured visual QA of a rendered website in a real browser — screenshots per page, viewport and state, then a finding (PASS/FAIL/WARNING with evidence) for every criterion in a fixed rubric covering layout, typography, imagery, colour, hierarchy, states, content and brand fit. Never concludes "looks good". Load after build or design changes, alongside responsive and accessibility gates.
---

# Visual browser QA

Visual QA is a rubric evaluation, not an impression. Every criterion gets an explicit status with evidence. A report containing "looks good", "looks fine", "seems ok" or similar without criterion-level findings is invalid and must be redone.

## Setup

- Serve the deploy folder exactly as it will be uploaded.
- Viewports: 390, 768, 1280, 1440 (full responsive matrix is `responsive-quality-gate`'s job; this skill judges visual quality).
- States per page: initial load (above the fold), full page, mobile menu open, hover/focus on primary CTA and nav, form empty/error/success, consent banner (if any), click-to-load placeholders, 404 page.
- Also capture with `prefers-reduced-motion: reduce` and, if the site supports it, dark scheme.
- Save screenshots as `qa/visual/<page>-<width>-<state>.png`; every finding references at least one screenshot.

## Rubric (evaluate every criterion on every page × viewport)

| ID | Criterion | FAIL when |
| --- | --- | --- |
| V1 | First viewport communicates who/what/where | Business, offer or location not identifiable without scrolling at 390 and 1440 |
| V2 | Single clear focal point and primary action | Two competing focal points; no visible primary CTA above the fold on mobile |
| V3 | Visual hierarchy | Heading levels visually indistinguishable; body and headings too close in size/weight; section titles weaker than body |
| V4 | Alignment and grid | Edges misaligned between siblings (> 2 px); inconsistent container widths between sections |
| V5 | Spacing rhythm | Gaps not from the spacing scale; unrelated items closer than related ones; cramped or uneven section padding |
| V6 | Typography | Off-scale font sizes; > 2 families or > 3 weights; widows/orphans in headlines; line length > 80 ch; fallback font visible (FOUT that persists); missing umlaut glyphs |
| V7 | Colour and contrast | Off-palette colours; accent overuse; text over imagery unreadable (measure); inconsistent link colour |
| V8 | Imagery quality | Pixelated/upscaled, wrong crop (subject cut off), stretched, inconsistent colour treatment, watermark visible, placeholder/stock-looking image where real photo expected |
| V9 | Imagery honesty | Stock people styled as the team; images not matching the business; AI artefacts (hands, text, logos) — cross-check `asset-rights-audit` |
| V10 | Components and states | Hover/focus/active/disabled/error/success state missing or inconsistent; focus ring invisible; buttons of the same role styled differently |
| V11 | Navigation presentation | Active page not indicated; menu items wrap/collide; mobile menu looks unfinished (no spacing, tiny targets) |
| V12 | Content completeness | Lorem ipsum, `[[FEHLT: …]]` placeholders, "TODO", broken characters (Ã¼), empty sections, English leftovers in German UI |
| V13 | Copy presentation | German typography errors (straight quotes, hyphen instead of dash, missing NBSP before units), inconsistent Sie/du, ALL-CAPS paragraphs |
| V14 | Footer and legal links | Impressum/Datenschutz links missing, low contrast, tiny, or covered by banner/sticky elements |
| V15 | Brand consistency | Logo distorted/low-res/wrong colours; brand colours or tone inconsistent across pages |
| V16 | Motion presentation | Content invisible until animation; janky or excessive motion; motion persists under reduced-motion |
| V17 | Visual stability | Layout shift visible during load (compare first paint vs final); late banners pushing content |
| V18 | Originality | Layout mimics a known brand site 1:1 (e.g. apple.com) or is an unmodified generic template |
| V19 | Overlays | Consent banner/chat/back-to-top overlapping content or each other; z-index glitches |
| V20 | Print/edge pages | 404 page unstyled; Impressum/Datenschutz pages unstyled or unreadable |

Statuses: PASS (checked, evidence attached), WARNING (minor polish, does not block), FAIL (blocks release). "Not applicable" must say why.

## Finding format

```json
{
  "id": "V8-leistungen-1440-initial",
  "criterion": "V8 Imagery quality",
  "page": "/leistungen/",
  "viewport": 1440,
  "state": "initial",
  "status": "FAIL",
  "evidence": { "screenshot": "qa/visual/leistungen-1440-initial.png", "selector": ".service-card:nth-child(2) img", "measured": "rendered 640px from 320px source (2x upscale)" },
  "expected": "Source ≥ rendered width × DPR",
  "fix": "Export 1280px and 1920px variants; add srcset"
}
```

## Method

1. For each page × viewport × state: capture, then evaluate V1–V20 in order. Measure where possible (computed styles, bounding boxes, contrast ratios, natural vs rendered image size) instead of eyeballing.
2. Compare pages side by side for V4, V5, V15 consistency.
3. Summarise: matrix page × criterion → status; then FAIL list with fixes; then WARNINGs.
4. After fixes, recapture and re-evaluate the affected criteria; reference old and new screenshots.

## Report end

"Evaluated N pages × M viewports × K states against V1–V20. FAIL: x, WARNING: y." — no adjectives summarising overall beauty.
