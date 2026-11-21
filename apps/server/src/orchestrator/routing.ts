import { ROLE_CAPABLE, type AgentId, type Role } from '@wf/shared';
import { cachedHealth } from '../agents/health.ts';
import { AgentError } from '../agents/errors.ts';
import { getSettings } from '../lib/settings.ts';

export interface RouteDecision {
  agent: 'claude' | 'codex';
  requested: 'claude' | 'codex';
  fallbackUsed: boolean;
  reason: string;
}

export function preferredAgent(role: Role, override?: AgentId | null): 'claude' | 'codex' {
  if (override === 'claude' || override === 'codex') return override;
  const s = getSettings();
  if (s.generationMode === 'claude-only') return 'claude';
  if (s.generationMode === 'codex-only') return 'codex';
  return s.roleMap[role] ?? 'claude';
}

function isAvailable(a: 'claude' | 'codex'): boolean {
  const h = cachedHealth(a);
  return !!h && h.available;
}

/**
 * Picks the agent for a role. Fallback to the other agent happens only in Hybrid mode,
 * only if the role is marked capable, and is always flagged — never a silent provider switch.
 * An explicit per-task override is respected and never silently replaced.
 */
export function route(role: Role, override?: AgentId | null): RouteDecision {
  const requested = preferredAgent(role, override);
  if (isAvailable(requested)) return { agent: requested, requested, fallbackUsed: false, reason: override ? 'explicit selection' : 'role assignment' };
  const mode = getSettings().generationMode;
  const other = requested === 'claude' ? 'codex' : 'claude';
  const explicit = override === 'claude' || override === 'codex';
  if (mode === 'hybrid' && !explicit && ROLE_CAPABLE[role].includes(other) && isAvailable(other)) {
    return { agent: other, requested, fallbackUsed: true, reason: `${requested} unavailable: ${cachedHealth(requested)?.message ?? 'unknown'}` };
  }
  throw new AgentError('unavailable', `${requested} is unavailable (${cachedHealth(requested)?.message ?? 'not checked'})${mode !== 'hybrid' ? ` and mode is ${mode}` : ''}. Retry, choose the other agent, or cancel.`);
}
