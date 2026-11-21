import { AxeBuilder } from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QAFinding, QASection } from '@wf/shared';
import { freshContext, settle } from './browser.ts';
import { f, section } from './section.ts';

/** axe-core (WCAG 2.2 A/AA tags) plus structural and keyboard checks axe does not cover. */
export async function accessibilityQA(base: string, pages: string[], siteDir: string): Promise<QASection> {
  const t0 = Date.now();
  const findings: QAFinding[] = [];
  let violations = 0;
  const ctx = await freshContext({ width: 1280, height: 900 });
  try {
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(new URL(p, base).toString(), { waitUntil: 'load', timeout: 30_000 });
      await settle(page, 300);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('.wf-consent').analyze();
      for (const v of res.violations) {
        violations++;
        const sev = v.impact === 'critical' || v.impact === 'serious' ? 'major' : 'minor';
        findings.push(f(sev, `${v.help} (${v.id})`, { page: p, ruleId: v.id, selector: v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | '), evidence: `${v.nodes.length} element(s) · ${v.impact}` }));
      }
      const s = await page.evaluate(() => {
        const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
        let skip = '';
        for (let i = 1; i < hs.length; i++) if (hs[i]! > hs[i - 1]! + 1) { skip = `h${hs[i - 1]} → h${hs[i]}`; break; }
        return {
          lang: document.documentElement.lang, h1: hs.filter((h) => h === 1).length, skip,
          main: !!document.querySelector('main'), nav: !!document.querySelector('nav'), header: !!document.querySelector('header'), footer: !!document.querySelector('footer'),
          skipLink: !!document.querySelector('a[href^="#"]:first-of-type'),
        };
      });
      if (!s.lang?.startsWith('de')) findings.push(f('major', `<html lang> is "${s.lang || 'missing'}" — expected "de"`, { page: p }));
      if (s.h1 !== 1) findings.push(f(s.h1 === 0 ? 'major' : 'minor', `${s.h1} <h1> elements (expected exactly 1)`, { page: p }));
      if (s.skip) findings.push(f('minor', `Heading level skipped: ${s.skip}`, { page: p }));
      for (const [k, ok] of [['main', s.main], ['header', s.header], ['footer', s.footer], ['nav', s.nav]] as const) if (!ok) findings.push(f(k === 'main' ? 'major' : 'minor', `Landmark <${k}> missing`, { page: p }));
      if (p === pages[0]) {
        // Keyboard: focus must be visible on the first interactive elements.
        let invisible = 0;
        let tested = 0;
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press('Tab');
          const r = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const cs = getComputedStyle(el);
            const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || cs.textDecorationLine.includes('underline') || cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
            return { visible, tag: el.tagName };
          });
          if (!r) continue;
          tested++;
          if (!r.visible) invisible++;
        }
        if (tested === 0) findings.push(f('major', 'No element reachable with the keyboard (Tab)', { page: p }));
        else if (invisible > 0) findings.push(f('major', `${invisible} of ${tested} focused elements show no visible focus indicator`, { page: p }));
      }
    }
  } finally {
    await ctx.close();
  }
  const css = ['assets/css/styles.css', 'styles.css', 'css/styles.css', 'assets/css/main.css'].map((c) => join(siteDir, c)).filter(existsSync).map((c) => readFileSync(c, 'utf8')).join('\n');
  if (/(animation|transition)\s*:/.test(css) && !/prefers-reduced-motion/.test(css)) findings.push(f('minor', 'Animations/transitions without a prefers-reduced-motion alternative'));
  return section('accessibility', 'Accessibility', t0, findings, { metrics: { axeViolations: violations, pages: pages.length }, summary: `axe WCAG 2.2 AA on ${pages.length} pages: ${violations} violation type(s); plus landmarks, headings, lang, keyboard focus` });
}
