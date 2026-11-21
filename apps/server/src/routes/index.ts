import type { FastifyInstance } from 'fastify';
import { agentRoutes } from './agents.ts';
import { customerRoutes } from './customers.ts';
import { eventRoutes } from './events.ts';
import { jobRoutes } from './jobs.ts';
import { systemRoutes } from './system.ts';
import { websiteRoutes } from './websites.ts';
import { pipelineRoutes } from './pipeline.ts';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(eventRoutes);
  await app.register(agentRoutes);
  await app.register(customerRoutes);
  await app.register(websiteRoutes);
  await app.register(jobRoutes);
  await app.register(systemRoutes);
  await app.register(pipelineRoutes);
}
