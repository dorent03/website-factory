import { desc, eq, inArray } from 'drizzle-orm';
import type { AgentId, JobKind, JobRecord, JobState, JobStepRecord, StepStatus } from '@wf/shared';
import { AgentError, WAITING_KINDS } from '../agents/errors.ts';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { id, now, redact } from '../lib/util.ts';
import { emit } from './events.ts';
import { withLock } from './locks.ts';

export interface JobInput {
  /** Per-step agent override chosen by the user (e.g. "Use other agent" after a limit). */
  agentOverrides?: Record<string, AgentId>;
  [k: string]: unknown;
}

export interface JobContext {
  job: JobRecord;
  input: JobInput;
  signal: AbortSignal;
  log: (line: string) => void;
  step: (detail: string) => void;
  agentFor: (stepKey: string) => AgentId | null;
  /** Persist extra input (e.g. intermediate IDs) so a resumed job can continue. */
  remember: (patch: Record<string, unknown>) => void;
}

export interface StepOutcome { status?: StepStatus; detail?: string }

export interface StepDef {
  key: string;
  label: string;
  agent: string;
  state: JobState;
  run: (ctx: JobContext) => Promise<StepOutcome | void>;
}

type Builder = (job: JobRecord) => StepDef[];
const builders = new Map<JobKind, Builder>();
const controllers = new Map<string, AbortController>();
const logs = new Map<string, string[]>();

export function registerJobKind(kind: JobKind, builder: Builder): void {
  builders.set(kind, builder);
}

function rowToJob(r: typeof schema.generationJobs.$inferSelect): JobRecord {
  return { id: r.id, kind: r.kind as JobKind, customerId: r.customerId, websiteId: r.websiteId, state: r.state as JobState, title: r.title, steps: r.steps as JobStepRecord[], error: r.error, input: r.input, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export function getJob(jobId: string): JobRecord | null {
  const r = db().select().from(schema.generationJobs).where(eq(schema.generationJobs.id, jobId)).get();
  return r ? rowToJob(r) : null;
}

export function listJobs(limit = 100): JobRecord[] {
  return db().select().from(schema.generationJobs).orderBy(desc(schema.generationJobs.createdAt)).limit(limit).all().map(rowToJob);
}

function save(job: JobRecord): JobRecord {
  job.updatedAt = now();
  db().update(schema.generationJobs).set({ state: job.state, steps: job.steps, error: job.error, input: job.input, updatedAt: job.updatedAt }).where(eq(schema.generationJobs.id, job.id)).run();
  emit({ type: 'job', job });
  if (job.websiteId) emit({ type: 'website', websiteId: job.websiteId });
  return job;
}

export function jobLog(jobId: string): string[] {
  return logs.get(jobId) ?? [];
}

export function createJob(kind: JobKind, opts: { customerId?: string | null; websiteId?: string | null; title: string; input?: JobInput }): JobRecord {
  const builder = builders.get(kind);
  if (!builder) throw new Error(`unknown job kind ${kind}`);
  const job: JobRecord = {
    id: id('job_'), kind, customerId: opts.customerId ?? null, websiteId: opts.websiteId ?? null, state: 'queued', title: opts.title,
    steps: [], error: '', input: opts.input ?? {}, createdAt: now(), updatedAt: now(),
  };
  job.steps = builder(job).map((s) => ({ key: s.key, label: s.label, agent: s.agent, status: 'waiting', detail: '', startedAt: null, finishedAt: null }));
  db().insert(schema.generationJobs).values({ ...job, steps: job.steps, input: job.input }).run();
  audit('user', 'job.create', job.id, { kind, title: opts.title });
  emit({ type: 'job', job });
  void runJob(job.id);
  return job;
}

const DONE: StepStatus[] = ['pass', 'warning', 'skipped', 'manual-review'];

/** Executes (or resumes) a job. Completed steps are skipped, so Retry continues where it stopped. */
export async function runJob(jobId: string): Promise<void> {
  const initial = getJob(jobId);
  if (!initial || controllers.has(jobId)) return;
  const builder = builders.get(initial.kind)!;
  const ctrl = new AbortController();
  controllers.set(jobId, ctrl);
  const lockKey = initial.websiteId ? `site:${initial.websiteId}` : initial.customerId ? `customer:${initial.customerId}` : `job:${jobId}`;
  try {
    await withLock(lockKey, jobId, async () => {
      const job = getJob(jobId)!;
      if (job.state === 'cancelled') return;
      const defs = builder(job);
      const input = (job.input ?? {}) as JobInput;
      const lines = logs.get(jobId) ?? [];
      logs.set(jobId, lines);
      const log = (line: string) => {
        const l = redact(line).slice(0, 2000);
        lines.push(`${new Date().toISOString().slice(11, 19)} ${l}`);
        if (lines.length > 2000) lines.shift();
        emit({ type: 'log', jobId, line: l, at: now() });
      };
      job.error = '';
      for (const def of defs) {
        let step = job.steps.find((s) => s.key === def.key);
        if (!step) { step = { key: def.key, label: def.label, agent: def.agent, status: 'waiting', detail: '', startedAt: null, finishedAt: null }; job.steps.push(step); }
        if (DONE.includes(step.status)) continue;
        if (ctrl.signal.aborted) break;
        step.status = 'running'; step.startedAt = now(); step.finishedAt = null; step.detail = '';
        job.state = def.state;
        save(job);
        log(`▶ ${def.label}`);
        const ctx: JobContext = {
          job, input, signal: ctrl.signal, log,
          step: (detail) => { step!.detail = detail.slice(0, 500); save(job); },
          agentFor: (k) => input.agentOverrides?.[k] ?? null,
          remember: (patch) => { Object.assign(input, patch); job.input = input; save(job); },
        };
        try {
          const out = (await def.run(ctx)) ?? {};
          step.status = out.status ?? 'pass';
          if (out.detail) step.detail = out.detail.slice(0, 500);
          step.finishedAt = now();
          log(`✓ ${def.label}: ${step.status}${step.detail ? ` — ${step.detail}` : ''}`);
          save(job);
        } catch (e) {
          step.finishedAt = now();
          if (ctrl.signal.aborted || (e instanceof AgentError && e.kind === 'cancelled')) {
            step.status = 'skipped'; step.detail = 'cancelled'; job.state = 'cancelled'; save(job); return;
          }
          const msg = redact((e as Error).message ?? String(e)).slice(0, 1500);
          if (e instanceof AgentError && WAITING_KINDS.has(e.kind)) {
            step.status = 'waiting-for-agent'; step.detail = msg; job.state = 'waiting-for-agent'; job.error = msg;
            log(`⏸ ${def.label}: waiting for agent — ${msg}`);
          } else {
            step.status = 'fail'; step.detail = msg; job.state = 'failed'; job.error = msg;
            log(`✗ ${def.label}: ${msg}`);
          }
          save(job);
          return;
        }
      }
      if (ctrl.signal.aborted) { job.state = 'cancelled'; save(job); return; }
      job.state = job.steps.some((s) => s.status === 'manual-review') ? 'manual-review' : 'complete';
      save(job);
      log(`■ ${job.title}: ${job.state}`);
    }, () => {
      const j = getJob(jobId);
      if (j) { j.state = 'queued'; save(j); }
    });
  } catch (e) {
    const j = getJob(jobId);
    if (j) { j.state = 'failed'; j.error = redact(String((e as Error).message)); save(j); }
  } finally {
    controllers.delete(jobId);
  }
}

/** Retry from the stopped step, optionally forcing a different agent for it. */
export function retryJob(jobId: string, useAgent?: AgentId): JobRecord {
  const job = getJob(jobId);
  if (!job) throw new Error('job not found');
  if (controllers.has(jobId)) throw new Error('job is running');
  const stopped = job.steps.find((s) => ['fail', 'waiting-for-agent', 'running', 'skipped'].includes(s.status) && s.detail !== '');
  const input = (job.input ?? {}) as JobInput;
  if (useAgent && stopped) input.agentOverrides = { ...(input.agentOverrides ?? {}), [stopped.key]: useAgent };
  for (const s of job.steps) if (!DONE.includes(s.status) || (s.status === 'skipped' && s.detail === 'cancelled')) { s.status = 'waiting'; s.detail = ''; }
  job.input = input; job.state = 'queued'; job.error = '';
  save(job);
  audit('user', 'job.retry', jobId, { useAgent: useAgent ?? null });
  void runJob(jobId);
  return job;
}

export function cancelJob(jobId: string): JobRecord | null {
  controllers.get(jobId)?.abort();
  const job = getJob(jobId);
  if (job && !controllers.has(jobId) && !['complete', 'failed', 'cancelled'].includes(job.state)) { job.state = 'cancelled'; save(job); }
  audit('user', 'job.cancel', jobId);
  return job;
}

/** On boot: anything that was running when the Factory stopped is marked interrupted (resumable via Retry). */
export function recoverInterrupted(): void {
  const terminal = ['complete', 'failed', 'cancelled', 'manual-review', 'waiting-for-agent'];
  for (const r of db().select().from(schema.generationJobs).all()) {
    if (terminal.includes(r.state)) continue;
    const job = rowToJob(r);
    for (const s of job.steps) if (s.status === 'running') { s.status = 'fail'; s.detail = 'Interrupted by Factory restart — Retry to resume'; }
    job.state = 'failed'; job.error = 'Interrupted by Factory restart — Retry to resume';
    save(job);
  }
  db().update(schema.agentTasks).set({ status: 'failed', error: 'Interrupted by Factory restart', finishedAt: now() }).where(inArray(schema.agentTasks.status, ['running', 'queued'])).run();
}

export function isJobRunning(jobId: string): boolean {
  return controllers.has(jobId);
}
