import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const id = (prefix = ''): string => `${prefix}${randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const now = (): string => new Date().toISOString();

/** Atomic JSON write (temp file + rename) so readers never see half-written artifacts. */
export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, path);
}

export function readJson<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s"']{8,}/gi,
  /Bearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

/** Removes anything that looks like a credential before text is logged or persisted. */
export function redact(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

export function truncate(text: string, max = 20_000): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]` : text;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
