# Attribution

- Source: https://github.com/dobromirdikov/codex-frontend-design-skill
- Commit: `983119775a936d123df9fbfbc3821bdee5bb58fd` (fetched 2026-11-02 via raw.githubusercontent.com)
- License: Apache License 2.0 — see `LICENSE` (copied unchanged).
- NOTICE: the upstream repository contains **no NOTICE file** at this commit, so there is none to retain. Upstream attribution (from its README and SKILL.md): "Based on Anthropic's `frontend-design` skill in `anthropics/claude-plugins-official`, licensed under Apache License 2.0."

## Vendored files

| Here | Upstream path | Changes |
| --- | --- | --- |
| `landing-page-rules-and-visual-qa.md` | `skills/frontend-design/SKILL.md` | Modified 2026-11-02: excerpt containing only the "Landing Page Rules" and "Visual QA Checklist" sections (verbatim); frontmatter and all other sections removed; modification header added (Apache-2.0 §4(b)) |

## Caveats for Factory use

- "Use a relevant image, generated bitmap …": generated imagery must pass `asset-rights-audit` (never generated people as staff, never fake premises).
- Its Visual QA widths (1440/768/390) are a subset of the Factory's `responsive-quality-gate` (8 widths), which takes precedence; `visual-browser-qa` defines the finding format.
