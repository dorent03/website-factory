---
name: responsive-quality-gate
description: Release gate that tests a built website at 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px and fails on horizontal overflow, clipped or overlapping content, broken navigation, undersized touch targets, broken forms and broken fixed/sticky elements. Load after any layout change and before release; produces per-viewport PASS/FAIL findings with evidence.
---

# Responsive quality gate

A page passes only if **every** check passes at **every** width. No "mostly fine".

## Viewports (all mandatory)

| Width | Height | Represents | Mode |
| --- | --- | --- | --- |
| 375 | 812 | Small iPhone | mobile, touch, DPR 3 |
| 390 | 844 | Current iPhone | mobile, touch, DPR 3 |
| 430 | 932 | Large phone | mobile, touch, DPR 3 |
| 768 | 1024 | Tablet portrait | touch, DPR 2 |
| 1024 | 768 | Tablet landscape / small laptop | touch + pointer |
| 1280 | 800 | Laptop | pointer |
| 1440 | 900 | Desktop | pointer |
| 1920 | 1080 | Large desktop | pointer |

Additionally spot-check 320 px (reflow) and 200 % zoom at 1280 px → `accessibility-quality-gate`.

## Procedure per page × viewport

1. Fresh context with the viewport, `isMobile`/`hasTouch` for ≤ 1024. Load, wait for network idle and fonts (`document.fonts.ready`).
2. Full-page screenshot + above-the-fold screenshot → `qa/responsive/<page>-<width>.png`.
3. Run the automated checks below (Playwright `page.evaluate`).
4. Interact: open/close mobile menu, open every disclosure/accordion, focus and fill every form field, submit empty (validation) and valid (test handler), scroll to bottom and back to check sticky elements.
5. Repeat screenshots in the opened-menu state.

## Checks and fail criteria

### Horizontal overflow — FAIL if any
- `document.documentElement.scrollWidth > window.innerWidth` (tolerance 0).
- Any element whose `getBoundingClientRect().right > innerWidth + 1` or `left < -1`, excluding elements inside an intentional `overflow-x: auto` region with `role="region"` and an accessible name. Report selector, width and the offending element's box.
- Common culprits to check: `100vw` widths, fixed-width images/iframes/tables, long German compounds or URLs without `overflow-wrap`/`hyphens`, negative margins, off-canvas menus not `visibility: hidden`.

### Clipping and overlap — FAIL if any
- Text node clipped: element with `overflow: hidden` whose `scrollHeight > clientHeight + 1` or `scrollWidth > clientWidth + 1` and contains text (allow intentional line-clamp only with full text available elsewhere).
- Overlapping interactive elements: bounding boxes of two visible interactive elements intersect.
- Text overlapping images/other text unintentionally (screenshot review + bounding-box intersection of text containers).
- Headline broken into single-word lines or a word split mid-syllable without hyphen.
- Images distorted (rendered aspect ratio differs > 2 % from natural, unless `object-fit` is set) or cropped so the subject is lost (screenshot review).

### Navigation — FAIL if any
- Not all primary nav items reachable at the width (hidden without a toggle).
- Mobile toggle missing `aria-expanded`/`aria-controls`, doesn't open, doesn't close (button, Esc, link click), or menu panel exceeds viewport without scrolling.
- Page behind an open menu still scrolls, or focus escapes to hidden content.
- Desktop nav wraps onto two lines or collides with logo/CTA at 1024 px.
- Anchor links land with the target hidden under a sticky header (`scroll-padding-top` missing).

### Touch targets — FAIL if any (≤ 1024 px)
- Interactive element smaller than 24 × 24 CSS px without 24 px spacing (WCAG 2.2 SC 2.5.8); inline text links in paragraphs exempt.
- WARNING if primary actions (CTA, menu toggle, phone link, form submit) are < 44 × 44 px.
- Adjacent targets closer than 8 px → WARNING.

### Forms — FAIL if any
- Field, label or error message overflows or is clipped.
- Input font-size < 16 px on mobile (iOS zoom-on-focus).
- Wrong keyboard: missing `type="email"`, `type="tel"`, `inputmode`, `autocomplete`.
- Submit unreachable, validation messages hidden behind keyboard/sticky elements, or form unusable at 375 px.
- Labels placed beside inputs with truncated text at narrow widths.

### Fixed and sticky elements — FAIL if any
- Fixed header/footer/banner covers > 25 % of the viewport height on mobile, or covers content permanently (no way to dismiss/scroll past).
- Sticky header jumps, flickers or overlaps content when scrolling (check scroll positions 0, 50 %, 100 %).
- Consent banner, chat button or back-to-top overlaps legal links, form submit or primary CTA.
- `100vh` used for full-height sections causing cut-off content behind mobile browser bars (prefer `100dvh`/`svh`).
- Safe-area insets ignored for fixed bottom elements on notched devices (`env(safe-area-inset-bottom)`).

### Layout quality — WARNING
- Line length > 80 characters at 1440/1920 px.
- Content stretched edge-to-edge at 1920 px without max-width.
- Awkward single wide column at 768 px or huge empty gaps at 1024 px.
- Images not served responsively (rendered size < 50 % of intrinsic size → wasted bytes).

## Finding format

```json
{ "id": "RESP-OVERFLOW-375-home", "page": "/", "viewport": 375, "check": "horizontal-overflow",
  "status": "FAIL", "selector": ".hero__image", "measured": "right=412px > 375px",
  "screenshot": "qa/responsive/home-375.png", "fix": "max-inline-size: 100%; remove width: 100vw" }
```

## Gate result

- `PASS` only when 8 viewports × all pages × all checks have no FAIL.
- Report a matrix: page × viewport → PASS/FAIL count, then findings sorted by severity.
- Re-run the full gate after fixes; never mark a fix verified from code alone.
