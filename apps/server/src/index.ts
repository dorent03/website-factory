import { API_PORT, HOST, PROD, UI_PORT } from './config.ts';
import { buildApp } from './app.ts';
import { checkAllAgents } from './agents/health.ts';
import { killAllAgents } from './agents/process.ts';
import { openDb, closeDb } from './db/index.ts';
import { emit } from './orchestrator/events.ts';
import { recoverInterrupted } from './orchestrator/jobs.ts';
import { sitesRoot } from './lib/safePath.ts';
import { startPreviewServer } from './preview/server.ts';
import './pipeline/register.ts';

openDb();
sitesRoot();
recoverInterrupted();

const app = await buildApp();
const port = PROD ? UI_PORT : API_PORT;
await app.listen({ host: HOST, port });
await startPreviewServer();
console.log(`[factory] api listening on http://${HOST}:${port}`);

void checkAllAgents().then((agents) => {
  emit({ type: 'agents', agents });
  for (const a of agents) console.log(`[factory] agent ${a.agent}: ${a.available ? 'ready' : 'unavailable'} ${a.version} ${a.message}`);
});

const shutdown = async () => {
  killAllAgents();
  await app.close().catch(() => {});
  closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
