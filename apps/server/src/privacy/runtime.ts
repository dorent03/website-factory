import type { ConsentCategory, ObservedRequest } from '@wf/shared';
import { freshContext, instrument, settle, storageSnapshot } from '../qa/browser.ts';

export interface RuntimeCapture {
  requests: ObservedRequest[];
  cookies: Array<{ name: string; domain: string; page: string }>;
  local: Array<{ name: string; page: string }>;
  session: Array<{ name: string; page: string }>;
  consoleErrors: Array<{ page: string; text: string }>;
  pageErrors: Array<{ page: string; text: string }>;
  banner: boolean;
}

export type ConsentAction = { kind: 'none' } | { kind: 'reject' } | { kind: 'accept' } | { kind: 'select'; categories: ConsentCategory[] };

/**
 * Visits every page in ONE fresh browser context (first-time visitor), optionally performing a consent action on the
 * first page, and records every request, cookie and storage key. This is the source of truth for technical behaviour.
 */
export async function captureRuntime(baseUrl: string, pages: string[], action: ConsentAction = { kind: 'none' }, phase = 'no-consent'): Promise<RuntimeCapture> {
  const ctx = await freshContext({ width: 1280, height: 900 });
  const firstParty = new URL(baseUrl).origin;
  const out: RuntimeCapture = { requests: [], cookies: [], local: [], session: [], consoleErrors: [], pageErrors: [], banner: false };
  try {
    const page = await ctx.newPage();
    const cap = instrument(page);
    let acted = false;
    for (const p of pages) {
      const from = cap.requests.length;
      const c0 = cap.console.length;
      const e0 = cap.pageErrors.length;
      await page.goto(new URL(p, baseUrl).toString(), { waitUntil: 'load', timeout: 30_000 });
      await settle(page, 800);
      if (!acted) {
        out.banner = await page.locator('.wf-consent, [role="dialog"][aria-labelledby*="consent" i], #cookie-banner, .cookie-banner').first().isVisible().catch(() => false);
        if (action.kind !== 'none') {
          if (action.kind === 'reject') await page.locator('[data-wf-consent-reject]').first().click({ timeout: 4000 }).catch(() => {});
          if (action.kind === 'accept') await page.locator('[data-wf-consent-accept]').first().click({ timeout: 4000 }).catch(() => {});
          if (action.kind === 'select') {
            await page.locator('[data-wf-consent-details]').first().click({ timeout: 4000 }).catch(() => {});
            for (const c of action.categories) await page.locator(`[data-wf-cat="${c}"]`).first().check({ timeout: 3000 }).catch(() => {});
            await page.locator('[data-wf-consent-save]').first().click({ timeout: 4000 }).catch(() => {});
          }
          await settle(page, 1200);
        }
        acted = true;
      }
      for (const r of cap.requests.slice(from)) {
        if (!r.url.startsWith('http')) continue;
        out.requests.push({ url: r.url.slice(0, 500), origin: r.origin, resourceType: r.resourceType, page: p, phase, firstParty: r.origin === firstParty });
      }
      for (const m of cap.console.slice(c0)) if (m.type === 'error') out.consoleErrors.push({ page: p, text: m.text });
      for (const e of cap.pageErrors.slice(e0)) out.pageErrors.push({ page: p, text: e });
      const st = await storageSnapshot(page);
      st.local.forEach((k) => out.local.push({ name: k, page: p }));
      st.session.forEach((k) => out.session.push({ name: k, page: p }));
    }
    for (const c of await ctx.cookies()) out.cookies.push({ name: c.name, domain: c.domain, page: '*' });
    const uniq = <T extends { name: string }>(list: T[]) => [...new Map(list.map((x) => [x.name, x])).values()];
    out.local = uniq(out.local);
    out.session = uniq(out.session);
    return out;
  } finally {
    await ctx.close().catch(() => {});
  }
}
