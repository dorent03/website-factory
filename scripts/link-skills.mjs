#!/usr/bin/env node
// Symlinks the Website Factory skills into the global Claude Code and Codex skill folders.
//
//   node scripts/link-skills.mjs            create links
//   node scripts/link-skills.mjs --dry-run  show what would happen, change nothing
//   node scripts/link-skills.mjs --unlink   remove links created by this script
//
// Linked: every skills/<name>/ containing a SKILL.md (vendored/ and third-party/ excluded),
// plus skills/third-party/frontend-ui. Existing entries that are not our own symlink are never touched.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const known = new Set(['--dry-run', '--unlink', '--help', '-h']);
for (const arg of args) {
  if (!known.has(arg)) {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}
if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node scripts/link-skills.mjs [--dry-run] [--unlink]');
  process.exit(0);
}
const dryRun = args.has('--dry-run');
const unlink = args.has('--unlink');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = path.join(repoRoot, 'skills');
const EXCLUDED = new Set(['vendored', 'third-party']);
const EXTRA = [path.join(skillsDir, 'third-party', 'frontend-ui')];
const TARGET_DIRS = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.codex', 'skills'),
];

function collectSources() {
  const sources = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !EXCLUDED.has(entry.name) && !entry.name.startsWith('.'))
    .map((entry) => path.join(skillsDir, entry.name));
  sources.push(...EXTRA);
  return sources
    .filter((dir) => {
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) return true;
      console.warn(`skip   ${path.relative(repoRoot, dir)} (no SKILL.md)`);
      return false;
    })
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

// Returns 'missing' | 'ours' | 'foreign' for the entry at linkPath.
function inspect(linkPath, source) {
  let stat;
  try {
    stat = fs.lstatSync(linkPath);
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
  if (!stat.isSymbolicLink()) return 'foreign';
  const target = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
  return target === source ? 'ours' : 'foreign';
}

const sources = collectSources();
const names = sources.map((dir) => path.basename(dir));
const duplicate = names.find((name, i) => names.indexOf(name) !== i);
if (duplicate) {
  console.error(`Two skills share the name "${duplicate}"; rename one before linking.`);
  process.exit(1);
}

const counts = { linked: 0, unlinked: 0, unchanged: 0, conflicts: 0 };
const conflicts = [];
const prefix = dryRun ? '[dry-run] ' : '';

console.log(`${prefix}${unlink ? 'Unlinking' : 'Linking'} ${sources.length} skills from ${skillsDir}`);

for (const targetDir of TARGET_DIRS) {
  console.log(`\n${targetDir}`);
  if (!unlink && !fs.existsSync(targetDir)) {
    console.log(`  ${prefix}create directory`);
    if (!dryRun) fs.mkdirSync(targetDir, { recursive: true });
  }
  for (const source of sources) {
    const name = path.basename(source);
    const linkPath = path.join(targetDir, name);
    const state = fs.existsSync(targetDir) ? inspect(linkPath, source) : 'missing';

    if (unlink) {
      if (state === 'ours') {
        if (!dryRun) fs.unlinkSync(linkPath);
        console.log(`  ${prefix}unlink    ${name}`);
        counts.unlinked++;
      } else if (state === 'foreign') {
        console.log(`  keep      ${name} (not our symlink)`);
        counts.unchanged++;
      } else {
        counts.unchanged++;
      }
      continue;
    }

    if (state === 'ours') {
      console.log(`  ok        ${name}`);
      counts.unchanged++;
    } else if (state === 'foreign') {
      console.log(`  CONFLICT  ${name} (existing entry is not our symlink; left untouched)`);
      conflicts.push(linkPath);
      counts.conflicts++;
    } else {
      if (!dryRun) fs.symlinkSync(source, linkPath, 'dir');
      console.log(`  ${prefix}link      ${name} -> ${path.relative(repoRoot, source)}`);
      counts.linked++;
    }
  }
}

console.log(
  `\n${prefix}Summary: ${unlink ? `${counts.unlinked} unlinked` : `${counts.linked} linked`}, ` +
    `${counts.unchanged} unchanged, ${counts.conflicts} conflicts`,
);
if (conflicts.length) {
  console.log('Resolve these by hand (rename or remove), then re-run:');
  for (const linkPath of conflicts) console.log(`  ${linkPath}`);
  process.exitCode = 1;
}
