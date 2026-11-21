import { createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import yauzl from 'yauzl';
import { audit } from '../lib/audit.ts';
import { isInside } from '../lib/safePath.ts';
import { registerJobKind } from '../orchestrator/jobs.ts';
import { createWebsite, pathsFor } from '../storage/websites.ts';
import { commitCurrent } from '../storage/versions.ts';
import { stepConsent, stepGate, stepLegal, stepPrivacy, stepQA } from './steps.ts';
import { renderStep, reviewStep } from './steps.ts';

const SKIP_EXT = new Set(['.php', '.phtml', '.cgi', '.pl', '.py', '.rb', '.sh', '.exe', '.dll', '.so', '.jar', '.bat', '.cmd', '.ps1', '.asp', '.aspx', '.jsp']);
const MAX_TOTAL = 300 * 1024 * 1024;
const MAX_FILES = 5000;

/** Copies a local static site folder (no symlinks, no server scripts, size-limited). */
function copyFolder(src: string, dest: string, skipped: string[]): number {
  let total = 0;
  let count = 0;
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === '.git' || n === 'node_modules' || n === '.DS_Store') continue;
      const p = join(d, n);
      const rel = relative(src, p);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) { skipped.push(`${rel} (symlink)`); continue; }
      if (st.isDirectory()) { walk(p); continue; }
      if (SKIP_EXT.has(extname(n).toLowerCase())) { skipped.push(`${rel} (server-side/executable)`); continue; }
      total += st.size;
      if (++count > MAX_FILES || total > MAX_TOTAL) throw new Error('import too large (max 5000 files / 300 MB)');
      mkdirSync(dirname(join(dest, rel)), { recursive: true });
      copyFileSync(p, join(dest, rel));
    }
  };
  walk(src);
  return count;
}

/** Extracts a ZIP with zip-slip protection. */
function extractZip(zipPath: string, dest: string, skipped: string[]): Promise<number> {
  return new Promise((res, rej) => {
    let count = 0;
    let total = 0;
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return rej(err ?? new Error('cannot open zip'));
      zip.on('error', rej);
      zip.on('end', () => res(count));
      zip.on('entry', (e: yauzl.Entry) => {
        const name = e.fileName.replace(/\\/g, '/');
        const out = resolve(dest, name);
        const mode = (e.externalFileAttributes >>> 16) & 0o170000;
        if (!isInside(dest, out) || name.startsWith('/') || mode === 0o120000) { skipped.push(`${name} (unsafe path or symlink)`); zip.readEntry(); return; }
        if (name.endsWith('/') || /(^|\/)(__MACOSX|\.git)\//.test(name) || name.endsWith('.DS_Store')) { zip.readEntry(); return; }
        if (SKIP_EXT.has(extname(name).toLowerCase())) { skipped.push(`${name} (server-side/executable)`); zip.readEntry(); return; }
        total += e.uncompressedSize;
        if (++count > MAX_FILES || total > MAX_TOTAL) { zip.close(); rej(new Error('import too large')); return; }
        mkdirSync(dirname(out), { recursive: true });
        zip.openReadStream(e, (er, stream) => {
          if (er || !stream) return rej(er);
          stream.pipe(createWriteStream(out)).on('finish', () => zip.readEntry()).on('error', rej);
        });
      });
      zip.readEntry();
    });
  });
}

/** Imports an existing static website as a new website of a customer; nothing is assumed legally correct. */
export async function importSite(customerId: string, opts: { name: string; siteType: string; source: string }) {
  const src = resolve(opts.source);
  if (!existsSync(src)) throw Object.assign(new Error('source not found'), { statusCode: 400 });
  const site = await createWebsite(customerId, { name: opts.name, siteType: opts.siteType });
  const p = pathsFor(site);
  const skipped: string[] = [];
  let count: number;
  if (statSync(src).isDirectory()) {
    if (isInside(src, p.root) || isInside(p.root, src)) throw new Error('source overlaps the target');
    count = copyFolder(src, p.current, skipped);
  } else if (src.toLowerCase().endsWith('.zip')) count = await extractZip(src, p.current, skipped);
  else throw Object.assign(new Error('source must be a folder or a .zip file'), { statusCode: 400 });
  const imported = existsSync(join(p.current, 'index.html'));
  const v = await commitCurrent(site.id, { label: 'import', agent: 'user', provider: 'import', model: '', prompt: `Imported from ${src}${skipped.length ? ` — skipped: ${skipped.slice(0, 20).join(', ')}` : ''}` });
  audit('user', 'website.import', site.id, { src, count, skipped });
  return { site, count, skipped, version: v?.dirName ?? null, hasIndex: imported };
}

registerJobKind('import', () => [
  { key: 'qa-1', label: 'Technical QA of imported site', agent: 'Browser', state: 'technical-review', run: stepQA },
  { key: 'privacy', label: 'Privacy inventory', agent: 'Browser', state: 'privacy-audit', run: async (ctx) => {
    // Imported sites: measure only — the Factory does not rewrite their legal pages automatically.
    const { buildInventory } = await import('../privacy/inventory.ts');
    const inv = await buildInventory(ctx.job.websiteId!);
    return { status: inv.services.some((s) => s.status === 'FAIL') ? 'fail' : 'pass', detail: `v${inv.version}: ${inv.services.length} processings, undeclared: ${inv.undeclaredOrigins.join(', ') || 'none'}` };
  } },
  { key: 'consent', label: 'Consent QA', agent: 'Browser', state: 'privacy-audit', run: stepConsent },
  { key: 'legal', label: 'Legal audit', agent: 'Factory', state: 'legal-audit', run: stepLegal },
  { key: 'render-final', label: 'Browser render', agent: 'Browser', state: 'rendering', run: renderStep('final') },
  { key: 'review-final', label: 'Claude visual review', agent: 'Claude', state: 'visual-review', run: reviewStep('final', 99) },
  { key: 'gate', label: 'Production gate', agent: 'Factory', state: 'manual-review', run: stepGate },
]);

export { stepPrivacy };
