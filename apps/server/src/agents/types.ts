import type { AgentId, Role } from '@wf/shared';

export interface AgentRunRequest {
  role: Role;
  prompt: string;
  /** Working directory; write access (if any) is confined here. */
  cwd: string;
  write: boolean;
  /** Strict JSON schema for the final structured answer. */
  outputSchema: Record<string, unknown>;
  /** Extra read-accessible directories (artifacts, screenshots). */
  addDirs: string[];
  /** Screenshot paths the agent must look at. */
  images: string[];
  webAccess: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  model?: string;
  maxBudgetUsd?: number;
  /** Reasoning effort; empty = CLI default. */
  effort?: string;
  onLog?: (line: string) => void;
}

export interface AgentRunResult {
  output: unknown;
  rawText: string;
  durationMs: number;
  exitCode: number | null;
  model: string;
  costUsd: number | null;
  stdoutTail: string;
  stderrTail: string;
}

export interface AgentAdapter {
  id: AgentId;
  label: string;
  run(req: AgentRunRequest): Promise<AgentRunResult>;
}
