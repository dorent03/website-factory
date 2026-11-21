/** Classifies agent failures so limits and auth problems are never retried in a loop. */
export type AgentErrorKind = 'rate_limit' | 'usage_limit' | 'auth' | 'provider' | 'timeout' | 'cancelled' | 'not_installed' | 'unavailable' | 'invalid_output' | 'failed';

const RULES: Array<[AgentErrorKind, RegExp]> = [
  ['usage_limit', /usage limit|quota|credit balance|out of credits|limit reached|reached your .*limit|plan limit|insufficient_quota/i],
  ['rate_limit', /rate.?limit|429|too many requests|overloaded_error|slow down/i],
  ['auth', /not logged in|please log ?in|unauthori[sz]ed|\b401\b|authenticat|oauth|session expired|invalid api key|login required|token expired|\/login/i],
  ['provider', /\b5\d\d\b|overloaded|service unavailable|internal server error|ECONNRESET|ETIMEDOUT|network error|fetch failed/i],
];

export function classifyAgentError(text: string, aborted: string | null): AgentErrorKind {
  if (aborted?.startsWith('timeout')) return 'timeout';
  if (aborted === 'cancelled') return 'cancelled';
  if (aborted?.startsWith('spawn failed')) return 'not_installed';
  for (const [kind, re] of RULES) if (re.test(text)) return kind;
  return 'failed';
}

/** These put the task into WAITING_FOR_AGENT: the user decides to retry, switch agent or cancel. */
export const WAITING_KINDS = new Set<AgentErrorKind>(['rate_limit', 'usage_limit', 'auth', 'provider', 'unavailable', 'not_installed']);

export class AgentError extends Error {
  constructor(public kind: AgentErrorKind, message: string, public details: { stdout?: string; stderr?: string; exitCode?: number | null; durationMs?: number } = {}) {
    super(message);
    this.name = 'AgentError';
  }
}
