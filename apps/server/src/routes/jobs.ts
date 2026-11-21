import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentId } from '@wf/shared';
import { cancelJob, getJob, jobLog, listJobs, retryJob } from '../orchestrator/jobs.ts';
import { listTasks } from '../orchestrator/tasks.ts';

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/jobs', async () => ({ jobs: listJobs(150) }));
  app.get('/api/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = getJob(id);
    if (!job) return reply.code(404).send({ error: 'job not found' });
    return { job, log: jobLog(id), tasks: listTasks({ jobId: id }) };
  });
  app.post('/api/jobs/:id/retry', async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ agent: AgentId.optional() }).parse(req.body ?? {});
    return { job: retryJob(id, body.agent) };
  });
  app.post('/api/jobs/:id/cancel', async (req) => ({ job: cancelJob((req.params as { id: string }).id) }));
}
