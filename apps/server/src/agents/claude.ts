import { CLAUDE_BIN_CANDIDATES } from '../config.ts';
import { truncate } from '../lib/util.ts';
import { findBinary } from './binaries.ts';
import { AgentError, classifyAgentError } from './errors.ts';
import { runProcess } from './process.ts';
import type { AgentAdapter, AgentRunRequest, AgentRunResult } from './types.ts';

export function claudeBinary(): string | null {
  return findBinary('claude', CLAUDE_BIN_CANDIDATES);
}

/**
 * Claude Code in print mode. Always `--restricted` (no shell/code tools, no user/project settings, file access limited
 * to the working dir + --add-dir) and `--strict-mcp-config` (no MCP servers). Write tasks only get Write/Edit on top.
 */
export function claudeArgs(req: AgentRunRequest): string[] {
  const tools = ['Read', 'Grep', 'Glob'];
  if (req.write) tools.push('Write', 'Edit');
  if (req.webAccess) tools.push('WebSearch', 'WebFetch');
  const args = [
    '-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config', '--restricted',
    '--json-schema', JSON.stringify(req.outputSchema),
    '--permission-mode', req.write ? 'acceptEdits' : 'default',
    '--tools', ...tools,
    '--allowedTools', ...tools,
  ];
  for (const d of req.addDirs) args.push('--add-dir', d);
  if (req.model) args.push('--model', req.model);
  if (req.effort) args.push('--effort', req.effort);
  if (req.maxBudgetUsd && req.maxBudgetUsd > 0) args.push('--max-budget-usd', String(req.maxBudgetUsd));
  return args;
}

export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  label: 'Claude Code',
  async run(req: AgentRunRequest): Promise<AgentRunResult> {
    const bin = claudeBinary();
    if (!bin) throw new AgentError('not_installed', 'Claude Code CLI not found');
    let prompt = req.prompt;
    if (req.images.length) {
      prompt += `\n\n## Screenshots you MUST open with the Read tool before answering\n${req.images.map((p) => `- ${p}`).join('\n')}\n`;
    }
    req.onLog?.(`claude: starting (${req.write ? 'write' : 'read-only'}${req.webAccess ? ', web' : ''})`);
    const r = await runProcess(bin, claudeArgs(req), { cwd: req.cwd, input: prompt, timeoutMs: req.timeoutMs, signal: req.signal });
    const details = { stdout: truncate(r.stdout, 4000), stderr: truncate(r.stderr, 4000), exitCode: r.exitCode, durationMs: r.durationMs };
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(r.stdout); } catch { /* not JSON */ }
    if (r.aborted || r.exitCode !== 0 || !parsed || parsed.is_error) {
      const msg = String(parsed?.result ?? '') + '\n' + r.stderr + (r.aborted ?? '') + (parsed?.api_error_status ? ` status ${parsed.api_error_status}` : '');
      const kind = classifyAgentError(msg, r.aborted);
      throw new AgentError(kind, `Claude ${kind}: ${truncate(msg.trim(), 600) || `exit ${r.exitCode}`}`, details);
    }
    let output = parsed.structured_output;
    if (output === undefined && typeof parsed.result === 'string') {
      try { output = JSON.parse(parsed.result); } catch { throw new AgentError('invalid_output', 'Claude returned no structured output', details); }
    }
    const model = Object.keys((parsed.modelUsage as Record<string, unknown>) ?? {})[0] ?? req.model ?? '';
    req.onLog?.(`claude: finished in ${Math.round(r.durationMs / 1000)}s (${parsed.num_turns ?? '?'} turns)`);
    return {
      output, rawText: String(parsed.result ?? ''), durationMs: r.durationMs, exitCode: r.exitCode, model,
      costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
      stdoutTail: details.stdout, stderrTail: details.stderr,
    };
  },
};
