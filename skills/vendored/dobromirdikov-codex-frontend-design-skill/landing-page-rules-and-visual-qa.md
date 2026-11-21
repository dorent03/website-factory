<!--
  Excerpt of skills/frontend-design/SKILL.md from
  https://github.com/dobromirdikov/codex-frontend-design-skill at commit
  983119775a936d123df9fbfbc3821bdee5bb58fd, licensed under the Apache License 2.0
  (see LICENSE in this folder). That file is itself derived from Anthropic's
  `frontend-design` skill (anthropics/claude-plugins-official, Apache-2.0).

  MODIFIED by Website Factory on 2026-11-02 (Apache-2.0 §4(b) notice):
  only the "Landing Page Rules" and "Visual QA Checklist" sections are kept,
  verbatim; frontmatter and all other sections were removed. No text inside
  the kept sections was changed.
-->

# Landing Page Rules and Visual QA (excerpt)

## Landing Page Rules

- Make the brand, product, venue, person, or offer obvious in the first viewport.
- Use the H1 for the literal product, brand, person, place, offer, or category. Put value propositions in supporting copy.
- Avoid the default split hero with text on one side and a decorative card or mockup on the other unless it is clearly the strongest domain-specific choice.
- Use a relevant image, generated bitmap, product screenshot, immersive scene, or real media when the page benefits from visual proof.
- Let the first viewport hint at the next section on desktop and mobile instead of making the hero feel like a sealed poster.
- Write concrete, domain-specific copy. Avoid empty SaaS phrases like "transform your workflow", "unlock your potential", and "seamless experience".

## Visual QA Checklist

Before finishing substantial frontend work, verify the rendered result in a browser:

- Check desktop around 1440px wide, tablet around 768px, and mobile around 390px when the app can run locally.
- Fix console errors, blank renders, clipped text, overlapping UI, broken assets, unreadable contrast, awkward first-viewport composition, and broken mobile navigation.
- Confirm primary imagery loads, is framed intentionally, and reveals the real product, place, state, gameplay, or subject.
- Confirm all important text fits its container and remains readable across the tested widths.
- Confirm hover, focus, active, empty, loading, and error states for controls touched by the work.
