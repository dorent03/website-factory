# Attribution

- Source: https://github.com/flitzrrr/frontend-design-skills
- Commit: `d607ba305bf606605de9382609864a69ad92699b` (fetched 2026-11-02 via raw.githubusercontent.com)
- License: MIT, Copyright (c) 2026 flitzrrr — see `LICENSE` (copied unchanged).

## Vendored files (unchanged copies)

| Here | Upstream path |
| --- | --- |
| `accessibility/SKILL.md` | `skills-src/accessibility/SKILL.md` |
| `accessibility/references/patterns.md` | `skills-src/accessibility/references/patterns.md` |
| `web-typography/SKILL.md` | `skills-src/web-typography/SKILL.md` |
| `web-typography/references/patterns.md` | `skills-src/web-typography/references/patterns.md` |
| `landing-pages/SKILL.md` | `skills-src/landing-pages/SKILL.md` |
| `website-audit/SKILL.md` | `skills-src/website-audit/SKILL.md` |

Not vendored on purpose: the npm installer (`bin/`), scraper/evolution scripts (`scripts/`, `tools/`), CI config and all other skills.

## Caveats for Factory use

- These files are reference material for prompt inlining only; they are NOT symlinked into global skill folders (their `name:` values would collide with generic skills).
- `accessibility`: targets WCAG 2.1 AA and states 44×44 px touch targets "per WCAG" — 44 px is WCAG 2.5.5 (AAA); WCAG 2.2 AA (2.5.8) requires 24 px. Its BFSG statement is simplified. The Factory's `accessibility-quality-gate` (WCAG 2.2 AA) and `legal-rules/` take precedence.
- `landing-pages`: recommends tracking/conversion measurement, A/B tests and countdowns. In the Factory, tracking is off by default and any analytics must pass `privacy-audit`/`consent-audit`; countdowns only with a real deadline. It references `references/conversion-patterns.md`, which does not exist upstream.
- `website-audit`: references `references/audit-checklisten.md` and `references/relaunch-phasen.md`, which do not exist upstream.
