import { and, desc, eq } from 'drizzle-orm';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { db, schema } from '../db/index.ts';
import { audit } from '../lib/audit.ts';
import { safeJoin } from '../lib/safePath.ts';
import { slugify } from '../lib/slug.ts';
import { id, now } from '../lib/util.ts';
import { changedFiles, git, head } from './git.ts';
import { readFileSync } from 'node:fs';
import { isAllowedSitekitFile } from '../sitekit/index.ts';
import { pathsFor, requireWebsite, updateWebsite, type WebsiteRow } from './websites.ts';

export type VersionRow = typeof schema.websiteVersions.$inferSelect;

const FORBIDDEN_EXT = new Set(['.php', '.phtml', '.cgi', '.pl', '.py', '.rb', '.sh', '.bash', '.zsh', '.exe', '.dll', '.so', '.dylib', '.jar', '.bat', '.cmd', '.ps1', '.asp', '.aspx', '.jsp']);
const MAX_FILE = 15 * 1024 * 1024;

export function listVersions(websiteId: string): VersionRow[] {
  return db().select().from(schema.websiteVersions).where(eq(schema.websiteVersions.websiteId, websiteId)).orderBy(desc(schema.websiteVersions.number)).all();
}

export function getVersion(websiteId: string, versionId: string): VersionRow | null {
  return db().select().from(schema.websiteVersions).where(and(eq(schema.websiteVersions.websiteId, websiteId), eq(schema.websiteVersions.id, versionId))).get() ?? null;
}

export function latestVersion(websiteId: string): VersionRow | null {
  return listVersions(websiteId)[0] ?? null;
}

/** Walks a tree and reports anything an agent must never produce: symlinks, executables, oversized files. */
const HELPER_DIRS = new Set(['qa', 'tests', 'test', '__tests__', 'node_modules', '.vscode', '.idea', 'scripts', 'tmp', '.tmp']);
const HELPER_FILES = /^(readme(\.[a-z]+)?|notes?\.(md|txt)|todo\.(md|txt)|package(-lock)?\.json|.+\.(md|log|map))$/i;

/**
 * Agents sometimes leave development helpers (test scripts, QA folders, READMEs) in their output.
 * They are not part of a deployable site: remove them before validation and report what was removed.
 * Real problems (symlinks, oversized files) are still rejected by scanTree.
 */
export function stripAgentHelpers(root: string): string[] {
  const removed: string[] = [];
  for (const n of readdirSync(root)) {
    const p = join(root, n);
    const st = lstatSync(p);
    if (st.isDirectory() && HELPER_DIRS.has(n.toLowerCase())) { rmSync(p, { recursive: true, force: true }); removed.push(`${n}/`); }
    else if (st.isFile() && HELPER_FILES.test(n)) { rmSync(p, { force: true }); removed.push(n); }
  }
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      if (n === '.git') continue;
      const p = join(dir, n);
      const st = lstatSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (st.isFile() && FORBIDDEN_EXT.has(extname(n).toLowerCase()) && !isAllowedSitekitFile(relative(root, p), readFileSync(p))) { rmSync(p, { force: true }); removed.push(relative(root, p)); }
    }
  };
  walk(root);
  return removed;
}

export function scanTree(root: string): string[] {
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git') continue;
      const p = join(dir, name);
      const rel = relative(root, p);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) { problems.push(`symlink not allowed: ${rel}`); continue; }
      if (st.isDirectory()) { walk(p); continue; }
      if (FORBIDDEN_EXT.has(extname(name).toLowerCase()) && !isAllowedSitekitFile(rel, readFileSync(p))) problems.push(`server-side/executable file not allowed in a static site: ${rel}`);
      if (st.size > MAX_FILE) problems.push(`file too large (${Math.round(st.size / 1e6)} MB): ${rel}`);
      if (st.mode & 0o111) problems.push(`executable bit set: ${rel}`);
    }
  };
  walk(root);
  return problems;
}

export interface VersionMeta {
  label: string;
  agent: string;
  provider: string;
  model: string;
  taskId?: string | null;
  prompt: string;
  impact?: unknown;
}

async function snapshot(site: WebsiteRow, meta: VersionMeta, files: string[], restoredFrom: string | null = null): Promise<VersionRow> {
  const p = pathsFor(site);
  const prev = latestVersion(site.id);
  const number = (prev?.number ?? 0) + 1;
  const dirName = `v${String(number).padStart(3, '0')}-${slugify(meta.label, 'update').slice(0, 40)}`;
  const target = safeJoin(p.versions, dirName);
  mkdirSync(target, { recursive: true });
  cpSync(p.current, target, { recursive: true, filter: (src) => !relative(p.current, src).split('/').includes('.git') });
  const commit = await head(p.current);
  await git(p.current, ['tag', '-f', `v${String(number).padStart(3, '0')}`, commit]);
  const row: typeof schema.websiteVersions.$inferInsert = {
    id: id('ver_'), websiteId: site.id, number, label: meta.label, dirName, gitCommit: commit, agent: meta.agent, provider: meta.provider,
    model: meta.model, taskId: meta.taskId ?? null, prompt: meta.prompt.slice(0, 4000), filesChanged: files, impact: meta.impact ?? null,
    qaState: 'NOT_RUN', legalState: 'NOT_RUN', restoredFrom, createdAt: now(),
  };
  db().insert(schema.websiteVersions).values(row).run();
  updateWebsite(site.id, { currentVersion: dirName, status: site.status === 'draft' ? 'in-progress' : site.status });
  audit(meta.agent, 'version.create', site.id, { dirName, files: files.length });
  return getVersion(site.id, row.id!)!;
}

/** Commits whatever is in current/ (factory-generated changes) and records a version. */
export async function commitCurrent(websiteId: string, meta: VersionMeta): Promise<VersionRow | null> {
  const site = requireWebsite(websiteId);
  const p = pathsFor(site);
  const problems = scanTree(p.current);
  if (problems.length) throw new Error(`refusing to version unsafe files:\n${problems.join('\n')}`);
  const before = await head(p.current);
  await git(p.current, ['add', '-A']);
  const status = await git(p.current, ['status', '--porcelain']);
  if (!status.trim()) return null;
  await git(p.current, ['commit', '-q', '-m', `${meta.label} (${meta.agent})`]);
  const files = (await changedFiles(p.current, before)).map((f) => `${f.status} ${f.path}`);
  return snapshot(site, meta, files);
}

export interface Worktree { path: string; branch: string; base: string }

/** Isolated working copy for a writing agent. The agent never writes current/ directly. */
export async function createWorktree(websiteId: string, taskKey: string): Promise<Worktree> {
  const site = requireWebsite(websiteId);
  const p = pathsFor(site);
  const name = slugify(taskKey, 'task');
  const path = safeJoin(p.work, name);
  if (existsSync(path)) await discardWorktree(websiteId, { path, branch: `task/${name}`, base: '' });
  const branch = `task/${name}`;
  await git(p.current, ['branch', '-D', branch], { allowFail: true });
  await git(p.current, ['worktree', 'add', '-q', '-b', branch, path, 'HEAD']);
  return { path, branch, base: await head(p.current) };
}

export async function discardWorktree(websiteId: string, wt: Worktree): Promise<void> {
  const p = pathsFor(requireWebsite(websiteId));
  await git(p.current, ['worktree', 'remove', '--force', wt.path], { allowFail: true });
  if (existsSync(wt.path)) rmSync(wt.path, { recursive: true, force: true });
  await git(p.current, ['worktree', 'prune'], { allowFail: true });
  await git(p.current, ['branch', '-D', wt.branch], { allowFail: true });
}

export interface IntegrationResult { version: VersionRow | null; files: Array<{ status: string; path: string }> }

/**
 * Validates an agent worktree and fast-forwards current/ to it, then records a version.
 * `beforeMerge` gets the changed file list (used for legal impact analysis) and may veto by throwing.
 */
export async function integrateWorktree(websiteId: string, wt: Worktree, inMeta: VersionMeta, beforeMerge?: (files: Array<{ status: string; path: string }>, wtPath: string) => Promise<unknown>): Promise<IntegrationResult> {
  const site = requireWebsite(websiteId);
  const p = pathsFor(site);
  let meta = inMeta;
  try {
    if (!statSync(wt.path).isDirectory()) throw new Error('worktree missing');
    const removed = stripAgentHelpers(wt.path);
    if (removed.length) meta = { ...meta, prompt: `${meta.prompt}\n[Factory removed agent helper files: ${removed.join(', ')}]` };
    const problems = scanTree(wt.path);
    if (problems.length) throw new Error(`agent output rejected:\n${problems.slice(0, 20).join('\n')}`);
    await git(wt.path, ['add', '-A']);
    if (!(await git(wt.path, ['status', '--porcelain'])).trim()) return { version: null, files: [] };
    await git(wt.path, ['commit', '-q', '-m', `${meta.label} (${meta.agent})`]);
    const files = await changedFiles(wt.path, wt.base);
    for (const f of files) if (f.path.startsWith('.git') || f.path.includes('..')) throw new Error(`illegal path in change set: ${f.path}`);
    const impact = beforeMerge ? await beforeMerge(files, wt.path) : null;
    if ((await head(p.current)) !== wt.base) throw new Error('current/ moved during the task — refusing to merge (no concurrent writes)');
    await git(p.current, ['merge', '-q', '--ff-only', wt.branch]);
    const version = await snapshot(site, { ...meta, impact: impact ?? meta.impact }, files.map((f) => `${f.status} ${f.path}`));
    return { version, files };
  } finally {
    await discardWorktree(websiteId, wt);
  }
}

export async function restoreVersion(websiteId: string, versionId: string): Promise<VersionRow> {
  const site = requireWebsite(websiteId);
  const v = getVersion(websiteId, versionId);
  if (!v) throw Object.assign(new Error('version not found'), { statusCode: 404 });
  const p = pathsFor(site);
  const before = await head(p.current);
  await git(p.current, ['restore', `--source=${v.gitCommit}`, '--staged', '--worktree', '--', '.']);
  await git(p.current, ['clean', '-fdq']);
  await git(p.current, ['add', '-A']);
  if ((await git(p.current, ['status', '--porcelain'])).trim()) await git(p.current, ['commit', '-q', '-m', `Restore ${v.dirName}`]);
  const files = (await changedFiles(p.current, before)).map((f) => `${f.status} ${f.path}`);
  const restored = await snapshot(site, { label: `restore-${v.dirName.slice(0, 4)}`, agent: 'user', provider: 'factory', model: '', prompt: `Restore ${v.dirName}` }, files, v.id);
  audit('user', 'version.restore', websiteId, { from: v.dirName, to: restored.dirName });
  return restored;
}

export async function diffVersions(websiteId: string, fromId: string, toId: string): Promise<{ files: Array<{ status: string; path: string }>; patch: string }> {
  const site = requireWebsite(websiteId);
  const a = getVersion(websiteId, fromId);
  const b = getVersion(websiteId, toId);
  if (!a || !b) throw Object.assign(new Error('version not found'), { statusCode: 404 });
  const p = pathsFor(site);
  const files = await changedFiles(p.current, a.gitCommit, b.gitCommit);
  const patch = await git(p.current, ['diff', '--no-color', '--stat', '--patch', '--no-ext-diff', a.gitCommit, b.gitCommit, '--', '.', ':(exclude)*.png', ':(exclude)*.jpg', ':(exclude)*.webp', ':(exclude)*.woff2']);
  return { files, patch: patch.length > 400_000 ? `${patch.slice(0, 400_000)}\n…(truncated)` : patch };
}
