import { runProcess } from '../agents/process.ts';

/**
 * git with hooks, fsmonitor, external diff/textconv and pagers disabled, so nothing inside a generated
 * site (or a malicious import) can execute code through git.
 */
const SAFE = [
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'core.pager=cat',
  '-c', 'user.name=Website Factory', '-c', 'user.email=factory@localhost', '-c', 'commit.gpgsign=false',
  '-c', 'init.defaultBranch=main', '-c', 'core.symlinks=false', '-c', 'protocol.allow=never',
];

export class GitError extends Error {}

export async function git(cwd: string, args: string[], opts: { allowFail?: boolean } = {}): Promise<string> {
  const r = await runProcess('git', [...SAFE, ...args], { cwd, timeoutMs: 120_000 });
  if (r.exitCode !== 0 && !opts.allowFail) throw new GitError(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 600)}`);
  return r.stdout;
}

export async function head(cwd: string): Promise<string> {
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
}

export async function changedFiles(cwd: string, from: string, to = 'HEAD'): Promise<Array<{ status: string; path: string }>> {
  const out = await git(cwd, ['diff', '--name-status', '--no-renames', '-z', from, to]);
  const parts = out.split('\0').filter(Boolean);
  const res: Array<{ status: string; path: string }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) res.push({ status: parts[i]!, path: parts[i + 1]! });
  return res;
}
