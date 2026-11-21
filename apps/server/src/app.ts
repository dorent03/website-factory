import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { API_PORT, PROD, UI_PORT, WEB_DIST } from './config.ts';
import { PathViolation } from './lib/safePath.ts';
import { registerRoutes } from './routes/index.ts';

/** Per-boot token. The UI reads it from /api/session (same-origin only); every mutating call must echo it. */
export const SESSION_TOKEN = randomBytes(24).toString('hex');

const allowedHosts = new Set([`localhost:${UI_PORT}`, `127.0.0.1:${UI_PORT}`, `localhost:${API_PORT}`, `127.0.0.1:${API_PORT}`]);
const allowedOrigins = new Set([`http://localhost:${UI_PORT}`, `http://127.0.0.1:${UI_PORT}`]);

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.WF_LOG ?? 'warn' }, bodyLimit: 25 * 1024 * 1024 });

  app.addHook('onRequest', async (req, reply) => {
    // DNS-rebinding and cross-site protection: only our own host names, only our own origin for writes.
    if (!allowedHosts.has(String(req.headers.host ?? ''))) return reply.code(421).send({ error: 'host not allowed' });
    if (!req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return reply.code(403).send({ error: 'origin not allowed' });
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-wf-token'] !== SESSION_TOKEN) {
      return reply.code(403).send({ error: 'missing or invalid session token' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation failed', issues: err.issues.slice(0, 20) });
    if (err instanceof PathViolation) return reply.code(400).send({ error: err.message });
    const code = (err as { statusCode?: number }).statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.code(code).send({ error: (err as Error).message });
  });

  app.get('/api/session', async () => ({ token: SESSION_TOKEN }));
  await registerRoutes(app);

  if (PROD && existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html')));
  }
  return app;
}
