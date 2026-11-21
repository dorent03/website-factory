import { freshContext, settle } from './browser.ts';

export interface CrawledPage {
  path: string;
  status: number;
  finalUrl: string;
  title: string;
  mainTextLength: number;
  links: Array<{ href: string; text: string; inFooter: boolean; inNav: boolean; external: boolean }>;
  footerText: string;
  bodyText: string;
  jsonLd: string[];
  redirects: number;
}

/** Renders every page and records links, footer text, body text and structured data (DOM as users see it). */
export async function crawlSite(base: string, pages: string[]): Promise<CrawledPage[]> {
  const ctx = await freshContext({ width: 1280, height: 900 });
  const origin = new URL(base).origin;
  const out: CrawledPage[] = [];
  try {
    const page = await ctx.newPage();
    for (const p of pages) {
      let redirects = 0;
      page.removeAllListeners('response');
      page.on('response', (r) => { if (r.request().isNavigationRequest() && r.status() >= 300 && r.status() < 400) redirects++; });
      const resp = await page.goto(new URL(p, base).toString(), { waitUntil: 'load', timeout: 30_000 }).catch(() => null);
      await settle(page, 300);
      const info = await page.evaluate((orig) => {
        const footer = document.querySelector('footer');
        const nav = document.querySelector('nav, header');
        return {
          title: document.title,
          mainTextLength: (document.querySelector('main')?.textContent ?? document.body.textContent ?? '').replace(/\s+/g, ' ').trim().length,
          links: [...document.querySelectorAll('a[href]')].map((a) => {
            const href = (a as HTMLAnchorElement).href;
            return { href, text: ((a as HTMLElement).innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80), inFooter: !!footer?.contains(a), inNav: !!nav?.contains(a), external: !href.startsWith(orig) };
          }),
          footerText: (footer?.innerText ?? '').replace(/\s+/g, ' ').trim(),
          bodyText: document.body.innerText.replace(/[ \t]+/g, ' ').slice(0, 60_000),
          jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ''),
        };
      }, origin).catch(() => ({ title: '', mainTextLength: 0, links: [], footerText: '', bodyText: '', jsonLd: [] }));
      out.push({ path: p, status: resp?.status() ?? 0, finalUrl: page.url(), redirects, ...info });
    }
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

export function linksTo(page: CrawledPage, target: string): boolean {
  return page.links.some((l) => { try { const u = new URL(l.href); return u.pathname.endsWith(`/${target}`) || u.pathname.endsWith(`/${target.replace('.html', '')}`); } catch { return false; } });
}
