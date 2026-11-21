import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  launching ??= chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] }).then((b) => { browser = b; launching = null; return b; });
  return launching;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close().catch(() => {});
  browser = null;
}

/** Fresh, isolated context: no cookies, no storage, no cache — what a first-time visitor sees. */
export async function freshContext(viewport = { width: 1440, height: 900 }, opts: { reducedMotion?: boolean } = {}): Promise<BrowserContext> {
  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport, deviceScaleFactor: 1, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block',
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference', ignoreHTTPSErrors: false, bypassCSP: false,
  });
  // tsx/esbuild emits __name() helpers inside functions we pass to page.evaluate; provide a no-op in the page.
  await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  return ctx;
}

export interface CapturedRequest { url: string; origin: string; resourceType: string; method: string; status: number | null; failed: boolean }
export interface PageCapture {
  url: string;
  status: number | null;
  requests: CapturedRequest[];
  console: Array<{ type: string; text: string }>;
  pageErrors: string[];
}

/** Attaches network/console listeners to a page. Call before navigation. */
export function instrument(page: Page): PageCapture {
  const cap: PageCapture = { url: '', status: null, requests: [], console: [], pageErrors: [] };
  page.on('request', (r) => {
    let origin = '';
    try { origin = new URL(r.url()).origin; } catch { origin = r.url().slice(0, 40); }
    cap.requests.push({ url: r.url(), origin, resourceType: r.resourceType(), method: r.method(), status: null, failed: false });
  });
  page.on('requestfinished', async (r) => {
    const e = cap.requests.find((x) => x.url === r.url() && x.status === null);
    if (e) e.status = (await r.response().catch(() => null))?.status() ?? null;
  });
  page.on('requestfailed', (r) => {
    const e = cap.requests.find((x) => x.url === r.url() && !x.failed);
    if (e) e.failed = true;
  });
  page.on('console', (m) => cap.console.push({ type: m.type(), text: m.text().slice(0, 500) }));
  page.on('pageerror', (e) => cap.pageErrors.push(String(e.message ?? e).slice(0, 500)));
  return cap;
}

export async function storageSnapshot(page: Page): Promise<{ local: string[]; session: string[] }> {
  return page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })).catch(() => ({ local: [], session: [] }));
}

export async function settle(page: Page, ms = 600): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
