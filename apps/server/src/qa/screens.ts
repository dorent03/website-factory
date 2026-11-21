import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshContext, settle } from './browser.ts';

export interface Shot { viewport: string; width: number; path: string; page: string }

/** Real screenshots of the rendered site — reviews always look at pixels, not just markup. */
export async function captureScreens(url: string, outDir: string, prefix: string, viewports: ReadonlyArray<{ name: string; width: number; height: number }>, maxHeight = 5200): Promise<Shot[]> {
  mkdirSync(outDir, { recursive: true });
  const shots: Shot[] = [];
  for (const vp of viewports) {
    const ctx = await freshContext({ width: vp.width, height: vp.height });
    try {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
      await settle(page, 700);
      // Trigger lazy content and scroll-driven reveals, then return to top.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(400);
      const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), maxHeight);
      const path = join(outDir, `${prefix}-${vp.name}.png`);
      await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width: vp.width, height }, animations: 'disabled' });
      shots.push({ viewport: vp.name, width: vp.width, path, page: url });
    } finally {
      await ctx.close();
    }
  }
  return shots;
}

export function shotDir(qaRoot: string, ...sub: string[]): string {
  return join(qaRoot, 'visual', ...sub);
}
