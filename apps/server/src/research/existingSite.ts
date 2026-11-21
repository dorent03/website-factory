import type { ExistingSiteAnalysis } from '@wf/shared';
import { assertPublicUrl } from './fetch.ts';
import { freshContext, instrument, settle, storageSnapshot } from '../qa/browser.ts';

const CMP = [/usercentrics/i, /cookiebot/i, /onetrust/i, /borlabs/i, /consentmanager/i, /klaro/i, /complianz/i, /iubenda/i, /cookieyes/i, /didomi/i, /real-cookie-banner/i];

/**
 * Renders an existing customer website in a fresh browser and records what it actually does.
 * The old site is analysed, never assumed legally correct and never cloned.
 */
export async function analyzeExistingSite(raw: string, maxPages = 6): Promise<ExistingSiteAnalysis> {
  const start = await assertPublicUrl(raw);
  const ctx = await freshContext();
  const pages: ExistingSiteAnalysis['pages'] = [];
  const third = new Set<string>();
  const iframes = new Set<string>();
  const notes: string[] = [];
  let nav: ExistingSiteAnalysis['navigation'] = [];
  let colors: string[] = [];
  let fonts: string[] = [];
  let forms = 0;
  let hasImp = false;
  let hasDs = false;
  let cmp = '';
  const storage = new Set<string>();
  try {
    const page = await ctx.newPage();
    const cap = instrument(page);
    const resp = await page.goto(start.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await settle(page, 1200);
    const origin = new URL(page.url()).origin;
    const info = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')].map((a) => ({ text: (a as HTMLElement).innerText.trim().slice(0, 80), href: (a as HTMLAnchorElement).href }));
      const navEl = document.querySelector('nav, header');
      const navLinks = navEl ? [...navEl.querySelectorAll('a[href]')].map((a) => ({ label: (a as HTMLElement).innerText.trim().slice(0, 60), href: (a as HTMLAnchorElement).href })).filter((l) => l.label) : [];
      const els = [...document.querySelectorAll('body, header, nav, footer, h1, h2, a, button, section')].slice(0, 400);
      const colorCount = new Map<string, number>();
      const fontCount = new Map<string, number>();
      for (const el of els) {
        const cs = getComputedStyle(el);
        for (const c of [cs.color, cs.backgroundColor]) if (c && !c.includes('rgba(0, 0, 0, 0)')) colorCount.set(c, (colorCount.get(c) ?? 0) + 1);
        fontCount.set(cs.fontFamily.split(',')[0]!.replace(/["']/g, '').trim(), (fontCount.get(cs.fontFamily) ?? 0) + 1);
      }
      return {
        links, navLinks: navLinks.slice(0, 25),
        colors: [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0]),
        fonts: [...fontCount.keys()].slice(0, 6),
        forms: document.forms.length,
        iframes: [...document.querySelectorAll('iframe')].map((f) => (f as HTMLIFrameElement).src).filter(Boolean),
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 140) ?? '',
        title: document.title,
        html: document.documentElement.outerHTML.slice(0, 400_000),
      };
    });
    pages.push({ url: page.url(), title: info.title, h1: info.h1, status: resp?.status() ?? 0 });
    nav = info.navLinks;
    colors = info.colors;
    fonts = info.fonts;
    forms += info.forms;
    info.iframes.forEach((s) => iframes.add(s));
    hasImp = info.links.some((l) => /impressum|imprint/i.test(l.text + l.href));
    hasDs = info.links.some((l) => /datenschutz|privacy/i.test(l.text + l.href));
    cmp = CMP.find((re) => re.test(info.html) || cap.requests.some((r) => re.test(r.url)))?.source.replace(/\\|\/i/g, '') ?? '';
    (await storageSnapshot(page)).local.forEach((k) => storage.add(k));
    const internal = [...new Set(info.links.map((l) => l.href).filter((h) => { try { const u = new URL(h); return u.origin === origin && !/\.(pdf|jpe?g|png|zip)$/i.test(u.pathname); } catch { return false; } }).map((h) => h.split('#')[0]!))].slice(0, maxPages - 1);
    for (const href of internal) {
      try {
        const r = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await settle(page, 300);
        const t = await page.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent?.trim().slice(0, 140) ?? '', forms: document.forms.length, iframes: [...document.querySelectorAll('iframe')].map((f) => (f as HTMLIFrameElement).src) }));
        pages.push({ url: page.url(), title: t.title, h1: t.h1, status: r?.status() ?? 0 });
        forms += t.forms;
        t.iframes.filter(Boolean).forEach((s) => iframes.add(s));
      } catch (e) { notes.push(`could not load ${href}: ${(e as Error).message.slice(0, 80)}`); }
    }
    for (const r of cap.requests) if (r.origin !== origin && r.origin.startsWith('http')) third.add(r.origin);
    const cookies = await ctx.cookies();
    if (third.size) notes.push(`${third.size} third-party origins contacted on first visit without interaction`);
    if (!cmp && cookies.some((c) => !c.domain.includes(new URL(origin).hostname))) notes.push('third-party cookies set without a detected consent tool');
    return {
      url: page.url(), analyzedAt: new Date().toISOString(), pages, navigation: nav, colors, fonts, thirdPartyOrigins: [...third],
      cookies: cookies.map((c) => ({ name: c.name, domain: c.domain })), localStorageKeys: [...storage], hasImpressumLink: hasImp, hasDatenschutzLink: hasDs,
      consentToolDetected: cmp, forms, iframes: [...iframes], notes,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}
