import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentId } from '@wf/shared';
import { allCachedHealth, applySimulation, checkAgent, checkAllAgents } from '../agents/health.ts';
import { audit } from '../lib/audit.ts';
import { FactorySettings, getSettings, updateSettings } from '../lib/settings.ts';
import { emit } from '../orchestrator/events.ts';
import { listTasks } from '../orchestrator/tasks.ts';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => ({ agents: allCachedHealth(), settings: getSettings() }));
  app.post('/api/agents/check', async (req) => {
    const body = z.object({ agent: AgentId.optional() }).parse(req.body ?? {});
    const agents = body.agent ? [await checkAgent(body.agent), ...allCachedHealth().filter((a) => a.agent !== body.agent)] : await checkAllAgents();
    emit({ type: 'agents', agents: allCachedHealth() });
    return { agents: allCachedHealth() };
  });
  app.get('/api/settings', async () => getSettings());
  app.put('/api/settings', async (req) => {
    const patch = FactorySettings.partial().parse(req.body);
    const next = updateSettings(patch);
    audit('user', 'settings.update', 'factory', patch);
    applySimulation();
    emit({ type: 'agents', agents: allCachedHealth() });
    return next;
  });
  app.get('/api/tasks', async (req) => {
    const q = z.object({ jobId: z.string().optional(), websiteId: z.string().optional() }).parse(req.query);
    return { tasks: listTasks(q) };
  });
}
