import { chromium } from 'playwright';
import { statSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { QAFinding, QASection } from '@wf/shared';
import { f, section } from './section.ts';
import { profile } from '../lib/settings.ts';

const TARGET = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 95 } as const;

/** Real Lighthouse runs (mobile emulation, simulated throttling) — scores are measured, never assumed. */
export async function performanceQA(base: string, pages: string[], siteDir: string): Promise<QASection> {
  const t0 = Date.now();
  const findings: QAFinding[] = [];
  const metrics: Record<string, number | string> = {};
  const { launch } = await import('chrome-launcher');
  const lighthouse = (await import('lighthouse')).default;
  const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu'] });
  try {
    for (const p of pages.slice(0, profile().lighthousePages)) {
      const url = new URL(p, base).toString();
      const r = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
      const lhr = r?.lhr;
      if (!lhr) { findings.push(f('major', 'Lighthouse returned no result', { page: p })); continue; }
      for (const [k, min] of Object.entries(TARGET)) {
        const score = Math.round((lhr.categories[k]?.score ?? 0) * 100);
        metrics[`${p}:${k}`] = score;
        if (score < min) findings.push(f(score < min - 15 ? 'major' : 'minor', `Lighthouse ${k} ${score} (target ≥ ${min})`, { page: p }));
      }
      const lcp = lhr.audits['largest-contentful-paint']?.numericValue;
      const cls = lhr.audits['cumulative-layout-shift']?.numericValue;
      const tbt = lhr.audits['total-blocking-time']?.numericValue;
      if (lcp) metrics[`${p}:LCP ms`] = Math.round(lcp);
      if (cls !== undefined) metrics[`${p}:CLS`] = Math.round(cls * 1000) / 1000;
      if (tbt !== undefined) metrics[`${p}:TBT ms`] = Math.round(tbt);
      if (cls !== undefined && cls > 0.1) findings.push(f('minor', `Cumulative Layout Shift ${cls.toFixed(3)} (> 0.1)`, { page: p }));
    }
  } finally {
    await chrome.kill();
  }
  const big: string[] = [];
  const walk = (d: string) => { if (!existsSync(d)) return; for (const n of readdirSync(d)) { const pth = join(d, n); const st = statSync(pth); if (st.isDirectory() && !n.startsWith('.')) walk(pth); else if (/\.(png|jpe?g|webp|avif|gif)$/i.test(n) && st.size > 300_000) big.push(`${pth.slice(siteDir.length + 1)} (${Math.round(st.size / 1024)} KB)`); } };
  walk(siteDir);
  if (big.length) findings.push(f('minor', 'Large images (> 300 KB)', { evidence: big.slice(0, 8).join(', ') }));
  return section('performance', 'Performance', t0, findings, { metrics, summary: `Lighthouse (mobile) on ${Math.min(profile().lighthousePages, pages.length)} page(s): ${Object.entries(metrics).filter(([k]) => k.endsWith(':performance')).map(([k, v]) => `${k.split(':')[0]} ${v}`).join(', ')}` });
}
