import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { runProcess } from '../agents/process.ts';
import { FACTORY_ROOT, SITES_ROOT } from '../config.ts';
import { audit } from '../lib/audit.ts';
import { customerDir, safeJoin, sitesRoot } from '../lib/safePath.ts';
import { requireCustomer } from '../storage/customers.ts';
import { pathsFor, requireWebsite } from '../storage/websites.ts';
import { previewOrigin } from '../preview/server.ts';

/** macOS conveniences. Only validated paths inside the sites root or preview URLs; `open` gets an argument array. */
export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/system', async () => ({ sitesRoot: SITES_ROOT, factoryRoot: FACTORY_ROOT, previewOrigin, node: process.version, platform: process.platform }));
  app.post('/api/system/open', async (req) => {
    const body = z.object({
      what: z.enum(['folder', 'terminal', 'site']),
      customerId: z.string().optional(),
      websiteId: z.string().optional(),
      sub: z.enum(['root', 'current', 'versions', 'qa', 'concepts']).default('root'),
    }).parse(req.body);
    let target: string;
    if (body.websiteId) {
      const p = pathsFor(requireWebsite(body.websiteId));
      target = body.sub === 'root' ? p.root : safeJoin(p.root, body.sub);
    } else if (body.customerId) target = customerDir(requireCustomer(body.customerId).slug);
    else target = sitesRoot();
    if (body.what === 'site') {
      const w = requireWebsite(body.websiteId ?? '');
      const c = requireCustomer(w.customerId);
      const url = `${previewOrigin}/p/${c.slug}/${w.slug}/current/`;
      await runProcess('/usr/bin/open', [url], { cwd: FACTORY_ROOT, timeoutMs: 10_000 });
      return { opened: url };
    }
    if (!existsSync(target)) throw Object.assign(new Error('folder does not exist yet'), { statusCode: 404 });
    const args = body.what === 'terminal' ? ['-a', 'Terminal', target] : [target];
    await runProcess('/usr/bin/open', args, { cwd: FACTORY_ROOT, timeoutMs: 10_000 });
    audit('user', `system.open.${body.what}`, target);
    return { opened: target };
  });
}
