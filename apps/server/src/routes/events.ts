import type { FastifyInstance } from 'fastify';
import { allCachedHealth } from '../agents/health.ts';
import { subscribe } from '../orchestrator/events.ts';

/** Server-Sent Events: live job steps, task status, agent health and log lines. */
export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ type: 'agents', agents: allCachedHealth() });
    const off = subscribe(send);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 20_000);
    req.raw.on('close', () => { off(); clearInterval(ping); });
  });
}
