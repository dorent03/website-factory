import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { git } from '../storage/git.ts';
import { commitCurrent, latestVersion } from '../storage/versions.ts';
import { markStale, pathsFor, requireWebsite } from '../storage/websites.ts';
import { impactAnalysis } from '../privacy/impact.ts';

/**
 * Edits made outside the Factory (e.g. in an editor) are never invisible: they become a "manual-edit"
 * version with impact analysis before any QA or audit runs.
 */
export async function captureManualEdits(websiteId: string): Promise<string | null> {
  const site = requireWebsite(websiteId);
  const p = pathsFor(site);
  if (!(await git(p.current, ['status', '--porcelain'])).trim()) return null;
  const prev = latestVersion(websiteId);
  const prevDir = prev ? join(p.versions, prev.dirName) : null;
  const impact = prevDir && existsSync(prevDir) ? impactAnalysis(prevDir, p.current) : null;
  const v = await commitCurrent(websiteId, { label: 'manual-edit', agent: 'user', provider: 'manual', model: '', prompt: 'Changes made outside the Factory', impact });
  if (v && impact?.requiresReaudit) markStale(websiteId, [`${v.dirName}: ${impact.summary}`]);
  return v?.dirName ?? null;
}
