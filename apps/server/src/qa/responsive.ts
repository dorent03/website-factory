import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { RESPONSIVE_WIDTHS, type QAFinding, type QASection } from '@wf/shared';
import { freshContext, settle } from './browser.ts';
import { f, section } from './section.ts';

/** Responsive quality gate at all eight required widths. */
export async function responsiveQA(base: string, pages: string[], outDir: string): Promise<QASection> {
  const t0 = Date.now();
  const findings: QAFinding[] = [];
  const artifacts: string[] = [];
  mkdirSync(outDir, { recursive: true });
  let checks = 0;
  const checkWidth = async (width: number) => {
    const ctx = await freshContext({ width, height: width < 768 ? 844 : 900 });
    const page = await ctx.newPage();
    try {
      for (const p of pages) {
        checks++;
        await page.goto(new URL(p, base).toString(), { waitUntil: 'load', timeout: 30_000 });
        await settle(page, 250);
        const r = await page.evaluate((w) => {
          const doc = document.documentElement;
          const overflow = doc.scrollWidth - window.innerWidth;
          const offenders: string[] = [];
          const clipped: string[] = [];
          const small: string[] = [];
          const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''}`;
          const inScroller = (el: Element) => { for (let e = el.parentElement; e; e = e.parentElement) { const ox = getComputedStyle(e).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true; } return false; };
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            // Fully off-screen elements are intentional (skip links, honeypots) — only partial overflow is a defect.
            if (rect.right <= 0 || rect.left >= window.innerWidth) continue;
            if ((rect.right > window.innerWidth + 1 || rect.left < -1) && !inScroller(el) && offenders.length < 6) offenders.push(`${describe(el)} (${Math.round(rect.left)}–${Math.round(rect.right)}px)`);
            if (/^(H1|H2|H3|P|A|BUTTON|LI|SPAN)$/.test(el.tagName) && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis' && clipped.length < 4) clipped.push(describe(el));
          }
          if (w <= 430) {
            for (const el of document.querySelectorAll('a, button, input, select, textarea, [role="button"]')) {
              const rect = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || rect.width === 0) continue;
              const inline = el.tagName === 'A' && el.closest('p, li') && cs.display === 'inline';
              if (!inline && (rect.width < 24 || rect.height < 24) && small.length < 6) small.push(`${describe(el)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
            }
          }
          const fixed = [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).position === 'fixed' && !el.closest('.wf-consent')).map((el) => el.getBoundingClientRect()).filter((r) => r.height * r.width > window.innerWidth * window.innerHeight * 0.4).length;
          const navLinks = [...document.querySelectorAll('header nav a, nav a')].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden'; }).length;
          const toggle = document.querySelector('header button[aria-expanded], nav button[aria-expanded], button[aria-controls]');
          const inputsOut = [...document.querySelectorAll('input, textarea, select')].filter((i) => i.getBoundingClientRect().right > window.innerWidth + 1).length;
          return { overflow, offenders, clipped, small, fixed, navLinks, hasToggle: !!toggle };
        }, width);
        const where = { page: p, viewport: `${width}px` };
        if (r.overflow > 1) findings.push(f('major', `Horizontal overflow of ${r.overflow}px`, { ...where, evidence: r.offenders.join(', ') }));
        else if (r.offenders.length) findings.push(f('minor', 'Elements extend beyond the viewport', { ...where, evidence: r.offenders.join(', ') }));
        if (r.clipped.length) findings.push(f('minor', 'Text clipped inside its box', { ...where, evidence: r.clipped.join(', ') }));
        if (r.small.length) findings.push(f('minor', 'Touch targets smaller than 24×24px (WCAG 2.5.8)', { ...where, evidence: r.small.join(', ') }));
        if (r.fixed) findings.push(f('major', 'Fixed element covers more than 40% of the viewport', where));
        if (r.navLinks === 0 && !r.hasToggle) findings.push(f('major', 'No visible navigation and no menu toggle', where));
        if (width <= 430 && r.hasToggle && r.navLinks === 0 && p === pages[0]) {
          const btn = page.locator('header button[aria-expanded], nav button[aria-expanded], button[aria-controls]').first();
          await btn.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(400);
          const visible = await page.evaluate(() => [...document.querySelectorAll('nav a')].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < window.innerHeight; }).length);
          const expanded = await btn.getAttribute('aria-expanded').catch(() => null);
          if (!visible) findings.push(f('critical', 'Mobile menu toggle does not reveal navigation links', where));
          else if (expanded !== 'true') findings.push(f('minor', 'Menu toggle does not set aria-expanded="true" when open', where));
        }
        if (p === pages[0] && [375, 768, 1440].includes(width)) {
          const shot = join(outDir, `home-${width}.png`);
          await page.screenshot({ path: shot, fullPage: false });
          artifacts.push(shot);
        }
      }
    } finally {
      await ctx.close();
    }
  };
  // Widths run four at a time (each in its own fresh context).
  for (let i = 0; i < RESPONSIVE_WIDTHS.length; i += 4) await Promise.all(RESPONSIVE_WIDTHS.slice(i, i + 4).map(checkWidth));
  return section('responsive', 'Responsive', t0, findings, { metrics: { checks, widths: RESPONSIVE_WIDTHS.length }, artifacts, summary: `${checks} page×width checks at ${RESPONSIVE_WIDTHS.join('/')}px — ${findings.length} finding(s)` });
}
