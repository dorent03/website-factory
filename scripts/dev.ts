/**
 * Website Factory launcher: preflight → backend → frontend → wait → open browser.
 *   npm run dev     development (Vite on :3000 proxies /api to Fastify on :3001)
 *   npm start       production (Fastify serves the built UI on :3000)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_PORT, FACTORY_ROOT, PREVIEW_PORT, SITES_ROOT, UI_PORT, WEB_DIST } from '../apps/server/src/config.ts';

const prod = process.argv.includes('--prod');
const watch = process.argv.includes('--watch');
const bin = (n: string) => join(FACTORY_ROOT, 'node_modules/.bin', n);
const ok = (m: string) => console.log(`  \x1b[32m●\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m●\x1b[0m ${m}`);
const fail = (m: string): never => { console.error(`  \x1b[31m●\x1b[0m ${m}`); process.exit(1); };

async function isOurs(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${port}/api/session`, { signal: AbortSignal.timeout(1500) });
    return r.ok && typeof (await r.json()).token === 'string';
  } catch { return false; }
}

async function portBusy(port: number): Promise<boolean> {
  try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) }); return true; } catch (e) {
    return !String((e as Error).cause ?? e).includes('ECONNREFUSED');
  }
}

function version(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  return r.status === 0 ? (r.stdout || r.stderr).trim().split('\n')[0]! : '';
}

async function preflight(): Promise<void> {
  console.log('\n\x1b[1mWebsite Factory\x1b[0m — preflight\n');
  // 1 environment
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) fail(`Node ${process.version} — Node 22+ required`);
  ok(`Node ${process.version} · ${process.platform}/${process.arch}${process.platform === 'darwin' ? '' : ' (macOS is the primary target)'}`);
  // 2 dependencies
  if (!existsSync(bin('tsx')) || !existsSync(join(FACTORY_ROOT, 'node_modules/fastify'))) {
    warn('dependencies missing — running npm install');
    const r = spawnSync('npm', ['install'], { cwd: FACTORY_ROOT, stdio: 'inherit' });
    if (r.status !== 0) fail('npm install failed');
  }
  ok('npm dependencies installed');
  // 3 database
  const { openDb, closeDb } = await import('../apps/server/src/db/index.ts');
  try {
    const { sqlite } = openDb();
    const tables = sqlite.prepare("select count(*) n from sqlite_master where type='table'").get() as { n: number };
    ok(`database ready (${tables.n} tables, migrations applied)`);
  } catch (e) { fail(`database: ${(e as Error).message}`); } finally { closeDb(); }
  // 4/5 storage
  mkdirSync(SITES_ROOT, { recursive: true });
  try {
    accessSync(SITES_ROOT, constants.W_OK);
    const probe = join(SITES_ROOT, `.wf-write-test-${process.pid}`);
    writeFileSync(probe, 'ok'); rmSync(probe);
  } catch { fail(`website storage not writable: ${SITES_ROOT}`); }
  ok(`website storage ${SITES_ROOT}`);
  // 6/7 agents (non-fatal)
  const { claudeBinary } = await import('../apps/server/src/agents/claude.ts');
  const { codexBinary } = await import('../apps/server/src/agents/codex.ts');
  const cb = claudeBinary();
  const xb = codexBinary();
  cb ? ok(`Claude Code ${version(cb, ['--version'])} (${cb})`) : warn('Claude Code not found — Claude tasks will wait or fall back');
  xb ? ok(`Codex ${version(xb, ['--version'])} (${xb})`) : warn('Codex not found — Codex tasks will wait or fall back');
  // browser for QA
  try {
    const { chromium } = await import('playwright');
    if (!existsSync(chromium.executablePath())) {
      warn('Playwright Chromium missing — installing');
      spawnSync(bin('playwright'), ['install', 'chromium'], { stdio: 'inherit' });
    }
    ok('Playwright Chromium available for browser QA');
  } catch { warn('Playwright not available — browser QA disabled'); }
}

async function waitFor(url: string, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (r.ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const children: ChildProcess[] = [];
function start(name: string, cmd: string, args: string[], env: Record<string, string> = {}): ChildProcess {
  const c = spawn(cmd, args, { cwd: FACTORY_ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[2m[${name}]\x1b[0m `;
  c.stdout!.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  c.stderr!.on('data', (d) => process.stderr.write(String(d).split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  c.on('exit', (code) => { if (code !== null && code !== 0) { console.error(`${tag}exited with ${code}`); shutdown(1); } });
  children.push(c);
  return c;
}

function shutdown(code = 0): void {
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 600).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main(): Promise<void> {
  const url = `http://localhost:${UI_PORT}`;
  if (await isOurs(UI_PORT)) {
    ok(`Website Factory already running — opening ${url}`);
    if (!process.env.WF_NO_OPEN) spawnSync('/usr/bin/open', [url]);
    return;
  }
  for (const p of prod ? [UI_PORT, PREVIEW_PORT] : [UI_PORT, API_PORT, PREVIEW_PORT]) if (await portBusy(p)) fail(`port ${p} is in use by another program`);
  await preflight();
  console.log('');
  if (prod) {
    if (!existsSync(join(WEB_DIST, 'index.html'))) {
      warn('UI not built — building');
      if (spawnSync('npm', ['-w', '@wf/web', 'run', 'build'], { cwd: FACTORY_ROOT, stdio: 'inherit' }).status !== 0) fail('UI build failed');
    }
    start('server', bin('tsx'), ['apps/server/src/index.ts'], { WF_PROD: '1' });
    if (!(await waitFor(`${url}/api/session`, 30_000))) fail('backend did not become ready');
  } else {
    start('server', bin('tsx'), [...(watch ? ['watch', '--clear-screen=false'] : []), 'apps/server/src/index.ts']);
    if (!(await waitFor(`http://localhost:${API_PORT}/api/session`, 30_000))) fail('backend did not become ready');
    ok(`backend http://localhost:${API_PORT}`);
    start('web', bin('vite'), ['--config', 'apps/web/vite.config.ts', '--port', String(UI_PORT), '--strictPort']);
    if (!(await waitFor(`${url}/api/session`, 30_000))) fail('frontend did not become ready');
  }
  ok(`preview origin http://localhost:${PREVIEW_PORT}`);
  ok(`Website Factory ready → ${url}`);
  if (!process.env.WF_NO_OPEN) spawnSync('/usr/bin/open', [url]);
}

void main();
