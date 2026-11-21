# Attribution

- Source: https://github.com/sboghossian/design-skill
- Commit: `a20fd990ed44a35bc447b3ace2b1b79236eb77fc` (fetched 2026-11-02 via raw.githubusercontent.com)
- License: MIT, Copyright (c) 2026 Stephane Boghossian — see `LICENSE` (copied unchanged).

## Vendored files

| Here | Upstream path | Changes |
| --- | --- | --- |
| `reference/checklist.md` | `reference/checklist.md` | none |
| `reference/industry-rules.md` | `reference/industry-rules.md` | Modified 2026-11-02: removed the hardcoded "HAQQ" default context from the Legal/Compliance heading; replaced commercial typefaces (Söhne, Söhne Mono, GT Sectra, PP Editorial) with open-licensed ones (IBM Plex, Source Sans 3, Source Serif 4, Public Sans, Figtree, Newsreader, Literata); added a modification note at the top |

Not vendored: `SKILL.md` and all other reference files.

## Caveats for Factory use

- `industry-rules.md` says it is "compressed from ui-ux-pro-max's 161-rule corpus". That upstream corpus's licence was not verified here; the text is used as published under sboghossian's MIT licence. Treat as a provenance note (see report).
- The Brutalist section names Helvetica, Times and Courier: use only as system font stacks, never ship those font files (commercial licences).
- `checklist.md` recommends 44×44 px touch targets and Heroicons/Lucide/Phosphor icons; the Factory's gates (`responsive-quality-gate`, `asset-rights-audit`) take precedence, and icons must be self-hosted.
