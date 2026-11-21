---
name: apple-inspired-web-design
description: Design principles for calm, premium, product-first static business websites in the spirit of Apple's design discipline — spacing, hierarchy, typography, navigation, imagery, section rhythm, restraint, motion, interaction and responsive behaviour. Load when designing or polishing a Website Factory site that should feel premium, minimal or "Apple-like". Principles only — never copies apple.com layouts, copy, assets or trademarks.
---

# Apple-inspired web design (principles only)

Goal: a site that feels calm, confident and expensive because every element earns its place — not a site that looks like apple.com.

## Hard boundary: inspiration, not imitation

- NEVER reproduce apple.com page layouts section-for-section, its copy or headline formulas, product names, photography, icons, SF Symbols, the Apple logo, "Designed by Apple", or any Apple trademark.
- NEVER use Apple-licensed fonts (SF Pro, SF Compact, New York) on the web. They are licensed for Apple-platform apps only. Use a self-hosted open-licensed font (see `german-website-compliance` → fonts) or a system stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), which renders SF on Apple devices without shipping it.
- NEVER describe the result to the customer as "Apple design" or reference Apple in copy, meta tags or alt text.
- Check: if a reviewer could hold the site next to an Apple page and match sections 1:1, it FAILS.

## Spacing

- Use one spacing scale (4 px base: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160). No values outside the scale.
- Section padding is generous and fluid: `padding-block: clamp(4rem, 2.5rem + 6vw, 10rem)`. Mobile minimum 64 px, desktop 120–160 px.
- Proximity encodes meaning: within a group 8–16 px, between groups 32–48 px, between sections ≥ 96 px desktop.
- Whitespace is the luxury signal. When unsure, remove an element before shrinking the gaps.
- Content column: body text `max-inline-size: 65ch`; full-bleed only for imagery.

## Hierarchy

- One idea per section, one primary message per viewport. A reader scanning only headlines must understand the offer.
- Exactly one `h1` per page naming the business/offer literally (not a slogan alone).
- Headline → one-sentence subline → at most one primary and one secondary action. No third CTA in the same block.
- Hierarchy comes from size, weight and space — not from colour, boxes, badges or icons.
- Each section has a single focal point (an image, a number, a headline). If two things compete, demote one.

## Typography

- One family, at most two (display + text). Max 3 weights (e.g. 400/600/700).
- Display headlines large and tight: `font-size: clamp(2.5rem, 1.5rem + 4vw, 5rem)`, `line-height: 1.05–1.1`, `letter-spacing: -0.015em to -0.03em`. Body 17–19 px, `line-height: 1.5–1.6`, tracking 0.
- Small text gets slightly positive tracking (+0.01em); large text negative. Never letter-space body copy.
- `text-wrap: balance` on headlines; `text-wrap: pretty` on paragraphs; `hyphens: auto` with `lang="de"` (German compounds otherwise overflow on mobile).
- Font must contain ä ö ü Ä Ö Ü ß ẞ „ " – €. Test the longest German word on the page at 375 px.
- No all-caps body, no underlines for emphasis, no more than 2 font sizes per section besides the headline.

## Navigation

- Slim, quiet top bar (44–56 px high), max 5–6 primary items, logo left, one optional CTA right.
- Optional translucent sticky header: `background: color-mix(in oklab, var(--bg) 72%, transparent); backdrop-filter: saturate(180%) blur(20px);` with an opaque fallback under `@supports not (backdrop-filter: blur(1px))` and contrast ≥ 4.5:1 over every section it can overlay.
- Mobile: a real `<button aria-expanded>` toggle; the menu is a full-height panel with large tap targets (≥ 44 px rows), closes on Esc, link click and outside tap; body scroll locked while open.
- Current page marked with `aria-current="page"` plus a non-colour cue.
- Impressum and Datenschutz always reachable in the footer on every page (see `german-website-compliance`).

## Premium imagery

- Imagery is the hero; UI chrome recedes. Prefer one large, excellent, real image over a collage.
- Use the customer's real photos (workshop, team, products, premises). Stock only with documented licence and never presented as the customer's staff or premises (see `asset-rights-audit`).
- Consistent treatment across the site: same colour temperature, crop logic, and corner radius (0 or one radius token).
- Product/object shots on calm, uniform backgrounds; generous negative space around the subject.
- Serve AVIF/WebP with `srcset`/`sizes`, explicit `width`/`height`, `loading="lazy"` below the fold, `fetchpriority="high"` for the LCP image only.
- No decorative blobs, gradients-as-filler, bokeh orbs, fake device mockups or AI-looking renders of the customer's "team".

## Section rhythm

- Alternate density: big visual statement → concise text block → detail grid → breathing space. Never three dense sections in a row.
- Alternate background tone sparingly (e.g. `--bg` and `--bg-subtle`); max two surface tones plus one dark "feature" section per page.
- Keep a consistent vertical grid: every section uses the same container and padding tokens.
- Typical business page: Hero (offer + one image) → Proof/benefit → Services (3–6 items, not a generic 3-card grid by default) → Process or about → Trust facts (verified only) → Contact CTA → Footer.

## Minimalism (checkable)

- Palette: 1 neutral ramp + 1 accent. Accent covers < 10 % of any viewport.
- No borders and shadows on the same element; prefer space over dividers.
- Remove: carousels for core content, auto-rotating sliders, parallax for its own sake, icon rows that restate the headline, "Welcome to our website".
- Every element must answer "what does the visitor lose if I delete this?" — if nothing, delete it.

## Motion

- Motion clarifies, never decorates. Allowed: fade/translate-in of a section once (≤ 24 px, 400–700 ms, `cubic-bezier(0.22, 1, 0.36, 1)`), hover/press feedback (120–200 ms), menu open/close (200–300 ms).
- Animate only `transform` and `opacity`. No scroll-jacking, no scroll-locked sequences, no autoplay video with sound.
- Content must be visible without JS and without motion: never start content at `opacity: 0` unless JS has confirmed it will animate it.
- `@media (prefers-reduced-motion: reduce)`: remove movement, keep instant state changes.
- For depth see the global `apple-design` and `animate` skills; do not duplicate their rules here.

## Interaction

- Every interactive element has hover (only under `@media (hover: hover)`), `:focus-visible` (≥ 2 px ring, ≥ 3:1), active, and disabled states.
- Buttons: min height 44 px, label is a verb ("Termin anfragen", "Angebot anfordern"), never "Hier klicken"/"Absenden" alone.
- Links look like links in body text (underline or clear colour + underline on hover).
- Feedback within 100 ms of a tap; forms show inline validation and a clear success state.

## Responsive behaviour

- Design mobile-first; the 375 px layout is the reference, not an afterthought.
- Type and space scale fluidly with `clamp()`; layout changes at content-driven breakpoints (roughly 48 rem, 64 rem, 80 rem).
- Images re-crop per breakpoint via `<picture>` when the subject would otherwise be lost.
- Max container ~1200–1440 px; at 1920 px content stays centred with growing margins, imagery may go full-bleed.
- Must pass `responsive-quality-gate` at all eight widths.

## Review checklist

- [ ] No Apple trademarks, assets, copy, fonts or 1:1 layout matches.
- [ ] One `h1`, one focal point per section, ≤ 2 CTAs per block.
- [ ] Spacing and type values all come from tokens/scale.
- [ ] ≤ 2 families, ≤ 3 weights, German glyphs and hyphenation verified at 375 px.
- [ ] Imagery is real or properly licensed and consistently treated.
- [ ] Motion limited to transform/opacity, reduced-motion respected, content visible without JS.
- [ ] Sticky/translucent header readable over every section.
- [ ] Passes `responsive-quality-gate`, `accessibility-quality-gate` and `visual-browser-qa`.
