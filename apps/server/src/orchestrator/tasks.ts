import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AgentId, AgentTaskRecord, Role } from '@wf/shared';
import { AgentError, WAITING_KINDS } from '../agents/errors.ts';
import { buildPrompt, type PromptSpec } from '../agents/prompt.ts';
import { adapters } from '../agents/registry.ts';
import { toStrictJsonSchema } from '../agents/schema.ts';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { getSettings, profile } from '../lib/settings.ts';
import { markUnavailable } from '../agents/health.ts';
import { id, now, redact, truncate } from '../lib/util.ts';
import { emit } from './events.ts';
import { route, type RouteDecision } from './routing.ts';

export interface TaskSpec<T> {
  jobId?: string | null;
  customerId?: string | null;
  websiteId?: string | null;
  role: Role;
  objective: string;
  prompt: Omit<PromptSpec, 'agent' | 'role' | 'objective' | 'write' | 'allowedPaths'>;
  output: z.ZodType<T>;
  expectedOutput: string;
  cwd: string;
  write?: boolean;
  allowedPaths?: string[];
  addDirs?: string[];
  images?: string[];
  inputArtifacts?: string[];
  webAccess?: boolean;
  agentOverride?: AgentId | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}

export interface TaskResult<T> {
  output: T;
  task: AgentTaskRecord;
  route: RouteDecision;
}

function toRecord(row: typeof schema.agentTasks.$inferSelect): AgentTaskRecord {
  return {
    id: row.id, jobId: row.jobId, customerId: row.customerId, websiteId: row.websiteId, agent: row.agent as AgentId,
    requestedAgent: row.requestedAgent as AgentId, fallbackUsed: row.fallbackUsed, role: row.role as Role, objective: row.objective,
    allowedPaths: row.allowedPaths, inputArtifacts: row.inputArtifacts, expectedOutput: row.expectedOutput, timeoutMs: row.timeoutMs,
    status: row.status as AgentTaskRecord['status'], write: row.write, exitCode: row.exitCode, durationMs: row.durationMs,
    error: row.error, errorKind: row.errorKind, model: row.model, createdAt: row.createdAt, startedAt: row.startedAt, finishedAt: row.finishedAt,
  };
}

function update(taskId: string, patch: Partial<typeof schema.agentTasks.$inferInsert>): AgentTaskRecord {
  if (Object.keys(patch).length) db().update(schema.agentTasks).set(patch).where(eq(schema.agentTasks.id, taskId)).run();
  const row = db().select().from(schema.agentTasks).where(eq(schema.agentTasks.id, taskId)).get()!;
  const rec = toRecord(row);
  emit({ type: 'task', task: rec });
  return rec;
}

/**
 * Runs one structured agent task end to end: route → persist → prompt → spawn → validate (one repair) → persist.
 * Throws AgentError; WAITING kinds leave the task in `waiting_for_agent` for the user to resolve.
 */
export async function runAgentTask<T>(spec: TaskSpec<T>): Promise<TaskResult<T>> {
  const settings = getSettings();
  const decision = route(spec.role, spec.agentOverride);
  const write = spec.write === true;
  const timeoutMs = spec.timeoutMs ?? settings.taskTimeoutMinutes * 60_000;
  const taskId = id('task_');
  db().insert(schema.agentTasks).values({
    id: taskId, jobId: spec.jobId ?? null, customerId: spec.customerId ?? null, websiteId: spec.websiteId ?? null,
    agent: decision.agent, requestedAgent: decision.requested, fallbackUsed: decision.fallbackUsed, role: spec.role,
    objective: spec.objective, context: { reason: decision.reason }, allowedPaths: spec.allowedPaths ?? [], inputArtifacts: spec.inputArtifacts ?? [],
    expectedOutput: spec.expectedOutput, timeoutMs, write, status: 'running', createdAt: now(), startedAt: now(),
  }).run();
  update(taskId, {});
  if (decision.fallbackUsed) spec.onLog?.(`FALLBACK AGENT USED: ${decision.agent} instead of ${decision.requested} (${decision.reason})`);
  audit(decision.agent, 'agent.task.start', taskId, { role: spec.role, write, cwd: spec.cwd, fallback: decision.fallbackUsed });

  const adapter = adapters[decision.agent]!;
  const outputSchema = toStrictJsonSchema(spec.output);
  const prompt = buildPrompt({ ...spec.prompt, agent: decision.agent, role: spec.role, objective: spec.objective, write, allowedPaths: spec.allowedPaths });
  const base = {
    role: spec.role, cwd: spec.cwd, write, outputSchema, addDirs: spec.addDirs ?? [], images: spec.images ?? [], webAccess: spec.webAccess === true,
    timeoutMs, signal: spec.signal, onLog: spec.onLog,
    model: decision.agent === 'claude' ? settings.models.claude || undefined : settings.models.codex || undefined,
    maxBudgetUsd: decision.agent === 'claude' ? settings.claudeMaxBudgetUsd : undefined,
    effort: decision.agent === 'claude' ? profile(settings).claudeEffort : profile(settings).codexEffort,
  };
  try {
    if (settings.simulateUnavailable[decision.agent]) throw new AgentError('unavailable', `${decision.agent} unavailable (simulated)`);
    let res = await adapter.run({ ...base, prompt });
    let parsed = spec.output.safeParse(res.output);
    if (!parsed.success) {
      spec.onLog?.(`${decision.agent}: output failed validation, requesting one repair`);
      const issues = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      res = await adapter.run({
        ...base, write: false, images: [], webAccess: false,
        prompt: `${buildPrompt({ agent: decision.agent, role: spec.role, objective: 'Repair a JSON answer that failed schema validation.', instructions: ['Return the corrected JSON only. Keep all content, fix only structure and types.'], write: false })}\n## Validation errors\n${issues}\n<artifact name="previous-answer">\n${truncate(JSON.stringify(res.output), 60_000)}\n</artifact>`,
      });
      parsed = spec.output.safeParse(res.output);
      if (!parsed.success) throw new AgentError('invalid_output', `output failed validation twice: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join('; ')}`);
    }
    const rec = update(taskId, {
      status: 'complete', exitCode: res.exitCode, durationMs: res.durationMs, model: res.model, finishedAt: now(),
      stdoutTail: redact(res.stdoutTail).slice(-4000), stderrTail: redact(res.stderrTail).slice(-4000), output: parsed.data as unknown,
    });
    audit(decision.agent, 'agent.task.complete', taskId, { durationMs: res.durationMs, model: res.model });
    return { output: parsed.data, task: rec, route: decision };
  } catch (e) {
    const err = e instanceof AgentError ? e : new AgentError('failed', (e as Error).message);
    const status = err.kind === 'cancelled' ? 'cancelled' : WAITING_KINDS.has(err.kind) ? 'waiting_for_agent' : 'failed';
    update(taskId, {
      status, error: redact(err.message).slice(0, 4000), errorKind: err.kind, exitCode: err.details.exitCode ?? null,
      durationMs: err.details.durationMs ?? null, finishedAt: now(),
      stdoutTail: redact(err.details.stdout ?? '').slice(-4000), stderrTail: redact(err.details.stderr ?? '').slice(-4000),
    });
    audit(decision.agent, 'agent.task.error', taskId, { kind: err.kind, message: err.message.slice(0, 500) });
    // A failed login is not transient: stop routing to this agent until a health check succeeds again.
    if (err.kind === 'auth') markUnavailable(decision.agent, `Login expired — open a terminal, run "${decision.agent}" and log in again, then Test connection`);
    throw err;
  }
}

export function listTasks(filter: { jobId?: string; websiteId?: string; limit?: number } = {}): AgentTaskRecord[] {
  const q = db().select().from(schema.agentTasks);
  const rows = filter.jobId ? q.where(eq(schema.agentTasks.jobId, filter.jobId)).all() : filter.websiteId ? q.where(eq(schema.agentTasks.websiteId, filter.websiteId)).all() : q.all();
  return rows.map(toRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filter.limit ?? 200);
}
