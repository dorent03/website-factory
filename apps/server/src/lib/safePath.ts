import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { SITES_ROOT } from '../config.ts';
import { SLUG_RE } from '@wf/shared';

export class PathViolation extends Error {
  constructor(message: string) { super(message); this.name = 'PathViolation'; }
}

/** Resolves the real path of the deepest existing ancestor, so symlinks anywhere in the chain are followed. */
function realOfExistingAncestor(p: string): string {
  let cur = p;
  const rest: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    rest.unshift(cur.slice(parent.length + 1));
    cur = parent;
  }
  return resolve(realpathSync(cur), ...rest);
}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

let realRoot: string | null = null;
export function sitesRoot(): string {
  if (!realRoot) {
    mkdirSync(SITES_ROOT, { recursive: true });
    realRoot = realpathSync(SITES_ROOT);
  }
  return realRoot;
}

export function assertSlug(s: string, what = 'slug'): string {
  if (!SLUG_RE.test(s)) throw new PathViolation(`invalid ${what}: ${JSON.stringify(s).slice(0, 80)}`);
  return s;
}

/**
 * Joins relative segments under `base` (default: the sites root) and guarantees the result,
 * after symlink resolution, stays inside `base`. Rejects absolute segments, `..`, NUL bytes.
 */
export function safeJoin(base: string, ...segments: string[]): string {
  const root = realOfExistingAncestor(resolve(base));
  if (!isInside(sitesRoot(), root)) throw new PathViolation(`base outside sites root: ${base}`);
  for (const s of segments) {
    if (typeof s !== 'string' || s.includes('\0')) throw new PathViolation('invalid path segment');
    if (isAbsolute(s)) throw new PathViolation(`absolute path not allowed: ${s}`);
    if (s.split(/[\\/]/).some((part) => part === '..')) throw new PathViolation(`parent traversal not allowed: ${s}`);
  }
  const joined = resolve(root, ...segments);
  if (!isInside(root, joined)) throw new PathViolation(`path escapes base: ${segments.join(sep)}`);
  const real = realOfExistingAncestor(joined);
  if (!isInside(root, real)) throw new PathViolation(`symlink escape: ${segments.join(sep)}`);
  return joined;
}

/** True if `p` (or any existing ancestor up to root) is a symlink pointing outside `root`. */
export function isSymlinkEscape(root: string, p: string): boolean {
  try {
    if (lstatSync(p).isSymbolicLink()) return !isInside(realpathSync(root), realpathSync(p));
  } catch {
    return true; // dangling symlink
  }
  return false;
}

export function customerDir(customerSlug: string): string {
  return safeJoin(sitesRoot(), assertSlug(customerSlug, 'customer slug'));
}

export function websiteDir(customerSlug: string, siteSlug: string): string {
  return safeJoin(customerDir(customerSlug), 'sites', assertSlug(siteSlug, 'website slug'));
}
