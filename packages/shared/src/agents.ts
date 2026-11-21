import { z } from 'zod';

export const AgentId = z.enum(['claude', 'codex', 'ollama']);
export type AgentId = z.infer<typeof AgentId>;
export const AGENT_LABELS: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex', ollama: 'Ollama' };

export const GenerationMode = z.enum(['hybrid', 'claude-only', 'codex-only']);
export type GenerationMode = z.infer<typeof GenerationMode>;

export const ROLES = [
  'research', 'strategy', 'content', 'design-direction', 'design-system', 'visual-review', 'legal-reasoning',
  'implementation', 'refactoring', 'testing', 'responsive-qa', 'accessibility-qa', 'performance-qa', 'security-qa', 'privacy-testing',
] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

/** Default role assignment from the product spec. Editable in Settings → AI Agents. */
export const DEFAULT_ROLE_MAP: Record<Role, 'claude' | 'codex'> = {
  research: 'claude', strategy: 'claude', content: 'claude', 'design-direction': 'claude', 'design-system': 'claude',
  'visual-review': 'claude', 'legal-reasoning': 'claude',
  implementation: 'codex', refactoring: 'codex', testing: 'codex', 'responsive-qa': 'codex', 'accessibility-qa': 'codex',
  'performance-qa': 'codex', 'security-qa': 'codex', 'privacy-testing': 'codex',
};

/** Which agents can technically perform a role (used for fallback). Research needs web tools. */
export const ROLE_CAPABLE: Record<Role, Array<'claude' | 'codex'>> = Object.fromEntries(
  ROLES.map((r) => [r, ['claude', 'codex']]),
) as Record<Role, Array<'claude' | 'codex'>>;

export const AgentHealth = z.object({
  agent: AgentId,
  installed: z.boolean(),
  available: z.boolean(),
  authenticated: z.enum(['yes', 'no', 'unknown']),
  version: z.string(),
  binary: z.string(),
  lastCheck: z.string(),
  message: z.string(),
  simulatedFailure: z.boolean(),
  optional: z.boolean(),
});
export type AgentHealth = z.infer<typeof AgentHealth>;

export const TaskStatus = z.enum(['queued', 'running', 'waiting', 'waiting_for_agent', 'reviewing', 'complete', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const JOB_STATES = [
  'queued', 'researching', 'planning', 'designing', 'generating', 'implementing', 'rendering', 'visual-review', 'technical-review',
  'responsive-qa', 'accessibility-qa', 'seo-qa', 'performance-qa', 'security-qa', 'privacy-audit', 'legal-audit', 'fixing',
  'manual-review', 'waiting-for-agent', 'complete', 'failed', 'cancelled',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const JOB_KINDS = ['research', 'brief', 'concepts', 'build', 'visual-review', 'technical-qa', 'qa', 'privacy', 'legal', 'pipeline', 'edit', 'import'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const StepStatus = z.enum(['waiting', 'running', 'pass', 'warning', 'fail', 'skipped', 'manual-review', 'waiting-for-agent']);
export type StepStatus = z.infer<typeof StepStatus>;

export interface AgentTaskRecord {
  id: string;
  jobId: string | null;
  customerId: string | null;
  websiteId: string | null;
  agent: AgentId;
  requestedAgent: AgentId;
  fallbackUsed: boolean;
  role: Role;
  objective: string;
  allowedPaths: string[];
  inputArtifacts: string[];
  expectedOutput: string;
  timeoutMs: number;
  status: TaskStatus;
  write: boolean;
  exitCode: number | null;
  durationMs: number | null;
  error: string;
  errorKind: string;
  model: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobStepRecord {
  key: string;
  label: string;
  agent: string;
  status: StepStatus;
  detail: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  customerId: string | null;
  websiteId: string | null;
  state: JobState;
  title: string;
  steps: JobStepRecord[];
  error: string;
  input: unknown;
  createdAt: string;
  updatedAt: string;
}

export type ServerEvent =
  | { type: 'job'; job: JobRecord }
  | { type: 'task'; task: AgentTaskRecord }
  | { type: 'agents'; agents: AgentHealth[] }
  | { type: 'log'; jobId: string; line: string; at: string }
  | { type: 'website'; websiteId: string };
