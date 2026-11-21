import Fastify from 'fastify';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { HOST, PREVIEW_PORT, UI_PORT } from '../config.ts';
import { assertSlug, safeJoin, websiteDir } from '../lib/safePath.ts';
import { PICKER_SCRIPT } from './picker.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
};

export const previewOrigin = `http://localhost:${PREVIEW_PORT}`;

/** URL of a website (or a version/concept) on the isolated preview origin. */
export function previewUrl(customerSlug: string, siteSlug: string, area = 'current', page = ''): string {
  return `${previewOrigin}/p/${customerSlug}/${siteSlug}/${area}/${page}`;
}

/**
 * Static file server on a separate origin. Generated site code runs here and can never reach the
 * Factory API with same-origin privileges. Read-only, sandbox-bound, no directory listings.
 */
export async function startPreviewServer(): Promise<void> {
  const app = Fastify({ logger: false });
  const hosts = new Set([`localhost:${PREVIEW_PORT}`, `127.0.0.1:${PREVIEW_PORT}`]);
  app.addHook('onRequest', async (req, reply) => {
    if (!hosts.has(String(req.headers.host ?? ''))) return reply.code(421).send('host not allowed');
  });
  app.get('/p/:customer/:site/*', async (req, reply) => {
    const { customer, site } = req.params as { customer: string; site: string; '*': string };
    const rest = decodeURIComponent((req.params as Record<string, string>)['*'] ?? '').split('?')[0]!;
    const segs = rest.split('/').filter(Boolean);
    const area = segs.shift() ?? 'current';
    let base: string;
    const root = websiteDir(assertSlug(customer), assertSlug(site));
    if (area === 'current') base = join(root, 'current');
    else if (area === 'versions' || area === 'concepts' || area === 'work') {
      const sub = segs.shift() ?? '';
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(sub)) return reply.code(404).send('not found');
      base = safeJoin(root, area === 'work' ? '.work' : area, sub);
    } else return reply.code(404).send('not found');
    let file = safeJoin(base, ...segs);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) && !extname(file)) file = `${file}.html`;
    if (/\.php$/i.test(file) || segs.some((s) => s.startsWith('.'))) return reply.code(403).type('text/plain').send('server-side files are not served by the preview');
    if (!existsSync(file) || !statSync(file).isFile()) {
      const nf = join(base, '404.html');
      if (existsSync(nf)) return reply.code(404).type('text/html; charset=utf-8').send(readFileSync(nf));
      return reply.code(404).type('text/plain').send('404 not found');
    }
    safeJoin(base, file.slice(base.length + 1));
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'no-store');
    const picker = (req.query as Record<string, string>)['wf-picker'] === '1';
    if (picker && type.startsWith('text/html')) {
      const html = readFileSync(file, 'utf8');
      const inject = `<script data-wf-picker>${PICKER_SCRIPT.replace('__PARENT__', `http://localhost:${UI_PORT}`)}</script>`;
      return reply.type(type).send(html.includes('</body>') ? html.replace('</body>', `${inject}</body>`) : html + inject);
    }
    return reply.type(type).send(createReadStream(file));
  });
  app.get('/', async () => 'Website Factory preview server');
  await app.listen({ host: HOST, port: PREVIEW_PORT });
}
