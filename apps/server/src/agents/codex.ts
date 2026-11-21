import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODEX_BIN_CANDIDATES } from '../config.ts';
import { truncate } from '../lib/util.ts';
import { findBinary } from './binaries.ts';
import { AgentError, classifyAgentError } from './errors.ts';
import { runProcess } from './process.ts';
import type { AgentAdapter, AgentRunRequest, AgentRunResult } from './types.ts';

export function codexBinary(): string | null {
  return findBinary('codex', CODEX_BIN_CANDIDATES);
}

/**
 * We run Codex with --ignore-user-config (no user hooks, plugins or MCP servers), so the user's preferred
 * model and effort are read from the top-level keys of ~/.codex/config.toml and passed explicitly.
 */
export function codexUserDefaults(): { model: string; effort: string } {
  const p = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml');
  if (!existsSync(p)) return { model: '', effort: '' };
  const top = readFileSync(p, 'utf8').split(/^\s*\[/m)[0] ?? '';
  const get = (k: string) => top.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"\\n]{1,80})"`, 'm'))?.[1] ?? '';
  return { model: get('model'), effort: get('model_reasoning_effort') };
}

export function codexArgs(req: AgentRunRequest, schemaFile: string, outFile: string): string[] {
  const { model, effort } = codexUserDefaults();
  const args: string[] = [];
  if (req.webAccess) args.push('--search');
  args.push(
    'exec', '-C', req.cwd, '-s', req.write ? 'workspace-write' : 'read-only',
    '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--output-schema', schemaFile, '-o', outFile, '--json',
  );
  const m = req.model || model;
  if (m) args.push('-m', m);
  const e = req.effort || effort;
  if (e) args.push('-c', `model_reasoning_effort="${e}"`);
  for (const d of req.addDirs) args.push('--add-dir', d);
  // Images last: -i is variadic. The prompt comes from stdin because no positional prompt is given.
  if (req.images.length) args.push('-i', ...req.images);
  return args;
}

function summarizeEvent(line: string): string | null {
  try {
    const e = JSON.parse(line);
    const it = e.item;
    if (e.type === 'item.started' && it?.type === 'command_execution') return `codex $ ${String(it.command).slice(0, 160)}`;
    if (e.type === 'item.completed' && it?.type === 'file_change') return `codex edited ${(it.changes ?? []).map((c: { path: string }) => c.path).join(', ').slice(0, 200)}`;
    if (e.type === 'item.completed' && it?.type === 'agent_message') return `codex: ${String(it.text).slice(0, 160)}`;
    if (e.type === 'turn.failed' || e.type === 'error') return `codex error: ${JSON.stringify(e).slice(0, 300)}`;
  } catch { /* partial line */ }
  return null;
}

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  label: 'Codex',
  async run(req: AgentRunRequest): Promise<AgentRunResult> {
    const bin = codexBinary();
    if (!bin) throw new AgentError('not_installed', 'Codex CLI not found');
    const dir = mkdtempSync(join(tmpdir(), 'wf-codex-'));
    const schemaFile = join(dir, 'schema.json');
    const outFile = join(dir, 'last.json');
    writeFileSync(schemaFile, JSON.stringify(req.outputSchema));
    let buf = '';
    const failures: string[] = [];
    req.onLog?.(`codex: starting (${req.write ? 'workspace-write' : 'read-only'})`);
    try {
      const r = await runProcess(bin, codexArgs(req, schemaFile, outFile), {
        cwd: req.cwd, input: req.prompt, timeoutMs: req.timeoutMs, signal: req.signal,
        onStdout: (chunk) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const l of lines) {
            const s = summarizeEvent(l);
            if (s) { req.onLog?.(s); if (s.startsWith('codex error')) failures.push(s); }
          }
        },
      });
      const details = { stdout: truncate(r.stdout.slice(-6000), 4000), stderr: truncate(r.stderr.slice(-6000), 4000), exitCode: r.exitCode, durationMs: r.durationMs };
      const last = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : '';
      if (r.aborted || r.exitCode !== 0 || !last) {
        const msg = failures.join('\n') + '\n' + r.stderr.slice(-3000) + (r.aborted ?? '');
        const kind = classifyAgentError(msg, r.aborted);
        throw new AgentError(kind === 'failed' && !last && r.exitCode === 0 ? 'invalid_output' : kind, `Codex ${kind}: ${truncate(msg.trim(), 600) || `exit ${r.exitCode}`}`, details);
      }
      let output: unknown;
      try { output = JSON.parse(last); } catch { throw new AgentError('invalid_output', 'Codex final message is not JSON', details); }
      req.onLog?.(`codex: finished in ${Math.round(r.durationMs / 1000)}s`);
      return { output, rawText: last, durationMs: r.durationMs, exitCode: r.exitCode, model: req.model || codexUserDefaults().model, costUsd: null, stdoutTail: details.stdout, stderrTail: details.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
