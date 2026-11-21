import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const FACTORY_ROOT = resolve(import.meta.dirname, '../../..');

/** Mandatory storage root for every customer website. Override only for isolated tests. */
export const SITES_ROOT = resolve(process.env.WF_SITES_ROOT ?? resolve(FACTORY_ROOT, '../sites'));
export const DATA_DIR = resolve(process.env.WF_DATA_DIR ?? resolve(FACTORY_ROOT, 'data'));
export const DB_PATH = resolve(DATA_DIR, 'factory.sqlite');
export const LEGAL_RULES_DIR = resolve(FACTORY_ROOT, 'legal-rules');
export const SKILLS_DIR = resolve(FACTORY_ROOT, 'skills');
export const WEB_DIST = resolve(FACTORY_ROOT, 'apps/web/dist');

export const UI_PORT = Number(process.env.WF_UI_PORT ?? 3000);
export const API_PORT = Number(process.env.WF_API_PORT ?? 3011);
export const PREVIEW_PORT = Number(process.env.WF_PREVIEW_PORT ?? 3100);
export const HOST = '127.0.0.1';
export const PROD = process.env.WF_PROD === '1';

export const CLAUDE_BIN_CANDIDATES = [resolve(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
export const CODEX_BIN_CANDIDATES = ['/opt/homebrew/bin/codex', resolve(homedir(), '.nvm/versions/node', process.version, 'bin/codex'), '/usr/local/bin/codex'];
export const OLLAMA_BIN_CANDIDATES = ['/opt/homebrew/bin/ollama', '/usr/local/bin/ollama'];

export const DEFAULT_TASK_TIMEOUT_MS = 20 * 60_000;
export const MAX_REVIEW_ROUNDS = 3;
