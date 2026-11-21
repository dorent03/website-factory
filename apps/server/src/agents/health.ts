import type { AgentHealth, AgentId } from '@wf/shared';
import { OLLAMA_BIN_CANDIDATES } from '../config.ts';
import { getSettings } from '../lib/settings.ts';
import { now } from '../lib/util.ts';
import { findBinary } from './binaries.ts';
import { claudeBinary } from './claude.ts';
import { codexBinary } from './codex.ts';
import { runProcess } from './process.ts';
import { emit } from '../orchestrator/events.ts';

const cache = new Map<AgentId, AgentHealth>();

async function version(bin: string, args = ['--version']): Promise<string> {
  const r = await runProcess(bin, args, { cwd: process.cwd(), timeoutMs: 15_000 });
  return r.exitCode === 0 ? (r.stdout || r.stderr).trim().split('\n')[0]!.slice(0, 80) : '';
}

/** Safe auth probe: only reads the logged-in flag, never prints account identifiers. */
async function claudeAuth(bin: string): Promise<'yes' | 'no' | 'unknown'> {
  const r = await runProcess(bin, ['auth', 'status', '--json'], { cwd: process.cwd(), timeoutMs: 20_000 });
  try { return JSON.parse(r.stdout).loggedIn === true ? 'yes' : 'no'; } catch { return 'unknown'; }
}

async function codexAuth(bin: string): Promise<'yes' | 'no' | 'unknown'> {
  const r = await runProcess(bin, ['login', 'status'], { cwd: process.cwd(), timeoutMs: 20_000 });
  const t = `${r.stdout}\n${r.stderr}`;
  if (/logged in/i.test(t) && !/not logged in/i.test(t)) return 'yes';
  if (/not logged in/i.test(t)) return 'no';
  return 'unknown';
}

export async function checkAgent(agent: AgentId): Promise<AgentHealth> {
  const sim = getSettings().simulateUnavailable;
  const base: AgentHealth = {
    agent, installed: false, available: false, authenticated: 'unknown', version: '', binary: '',
    lastCheck: now(), message: '', simulatedFailure: false, optional: agent === 'ollama',
  };
  let h: AgentHealth;
  if (agent === 'claude' || agent === 'codex') {
    const bin = agent === 'claude' ? claudeBinary() : codexBinary();
    if (!bin) h = { ...base, message: `${agent} CLI not found on PATH` };
    else {
      const [v, auth] = await Promise.all([version(bin), agent === 'claude' ? claudeAuth(bin) : codexAuth(bin)]);
      h = { ...base, installed: true, binary: bin, version: v, authenticated: auth, available: !!v && auth !== 'no', message: auth === 'no' ? 'Not logged in — run the CLI once in a terminal to log in' : v ? 'Ready' : 'Version check failed' };
    }
    if (sim[agent]) h = { ...h, available: false, simulatedFailure: true, message: 'Simulated unavailable (Settings → Diagnostics)' };
  } else {
    const bin = findBinary('ollama', OLLAMA_BIN_CANDIDATES);
    h = { ...base, installed: !!bin, binary: bin ?? '', version: bin ? await version(bin) : '', message: bin ? 'Optional — not used by the pipeline' : 'Optional — not installed' };
  }
  cache.set(agent, h);
  return h;
}

export async function checkAllAgents(): Promise<AgentHealth[]> {
  return Promise.all((['claude', 'codex', 'ollama'] as AgentId[]).map(checkAgent));
}

export function markUnavailable(agent: AgentId, message: string): void {
  const h = cache.get(agent);
  if (h) { cache.set(agent, { ...h, available: false, authenticated: 'no', message, lastCheck: now() }); emit({ type: 'agents', agents: allCachedHealth() }); }
}

export function cachedHealth(agent: AgentId): AgentHealth | undefined {
  return cache.get(agent);
}

export function allCachedHealth(): AgentHealth[] {
  return (['claude', 'codex', 'ollama'] as AgentId[]).map((a) => cache.get(a)).filter((h): h is AgentHealth => !!h);
}

/** Re-applies the simulation flag without re-probing (used right after settings change). */
export function applySimulation(): void {
  const sim = getSettings().simulateUnavailable;
  for (const a of ['claude', 'codex'] as const) {
    const h = cache.get(a);
    if (!h) continue;
    if (sim[a]) cache.set(a, { ...h, available: false, simulatedFailure: true, message: 'Simulated unavailable (Settings → Diagnostics)' });
    else if (h.simulatedFailure) cache.set(a, { ...h, simulatedFailure: false, available: h.installed && !!h.version && h.authenticated !== 'no', message: 'Ready' });
  }
}
