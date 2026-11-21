import { spawn, type ChildProcess } from 'node:child_process';
import { redact } from '../lib/util.ts';

const KILL_GRACE_MS = 5_000;
const MAX_OUTPUT = 16 * 1024 * 1024;

/** Environment passed to agent processes. Everything else (tokens, proxies, nested-agent markers) is dropped. */
const ENV_ALLOW = ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME', 'NVM_DIR', 'NVM_BIN'];

export function agentEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of ENV_ALLOW) if (process.env[k]) env[k] = process.env[k];
  env.LANG ??= 'en_US.UTF-8';
  env.NO_COLOR = '1';
  return { ...env, ...extra };
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  aborted: string | null;
}

export interface RunOptions {
  cwd: string;
  input?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

const running = new Set<ChildProcess>();

function killGroup(child: ChildProcess, sig: NodeJS.Signals) {
  try { if (child.pid) process.kill(-child.pid, sig); } catch { /* already gone */ }
}

export function killAllAgents(): void {
  for (const c of running) killGroup(c, 'SIGKILL');
}

/**
 * Structured process execution: binary + argument array, prompt on stdin, no shell.
 * Untrusted text can never become a command because nothing is ever interpreted by a shell.
 */
export function runProcess(bin: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let child: ChildProcess;
    try {
      child = spawn(bin, args, { cwd: opts.cwd, env: agentEnv(), stdio: ['pipe', 'pipe', 'pipe'], detached: true, shell: false });
    } catch (e) {
      resolve({ stdout: '', stderr: String(e), exitCode: null, durationMs: 0, aborted: `spawn failed: ${(e as Error).message}` });
      return;
    }
    running.add(child);
    let stdout = '';
    let stderr = '';
    let aborted: string | null = null;
    const stop = (reason: string) => {
      if (aborted) return;
      aborted = reason;
      killGroup(child, 'SIGTERM');
      setTimeout(() => killGroup(child, 'SIGKILL'), KILL_GRACE_MS).unref();
    };
    const timer = setTimeout(() => stop(`timeout after ${Math.round(opts.timeoutMs / 1000)}s`), opts.timeoutMs);
    const onAbort = () => stop('cancelled');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout!.setEncoding('utf8');
    child.stderr!.setEncoding('utf8');
    child.stdout!.on('data', (d: string) => {
      if (stdout.length < MAX_OUTPUT) stdout += d; else stop('output limit exceeded');
      opts.onStdout?.(d);
    });
    child.stderr!.on('data', (d: string) => {
      if (stderr.length < MAX_OUTPUT) stderr += d;
      opts.onStderr?.(redact(d));
    });
    child.stdin!.on('error', () => {});
    child.on('error', (e) => {
      if (child.pid === undefined) {
        clearTimeout(timer);
        running.delete(child);
        resolve({ stdout, stderr: String(e), exitCode: null, durationMs: Date.now() - started, aborted: `spawn failed: ${e.message}` });
      } else stop(e.message);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      running.delete(child);
      resolve({ stdout, stderr, exitCode: code, durationMs: Date.now() - started, aborted });
    });
    if (opts.signal?.aborted) onAbort();
    child.stdin!.end(opts.input ?? '');
  });
}
