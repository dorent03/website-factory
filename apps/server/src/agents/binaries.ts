import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Locates an executable without invoking a shell (shell functions/aliases are deliberately ignored). */
export function findBinary(name: string, candidates: string[]): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  // PATH first, so the Factory uses the same CLI the user runs in their terminal.
  for (const p of [...dirs.map((d) => join(d, name)), ...candidates]) {
    try {
      if (existsSync(p)) { accessSync(p, constants.X_OK); return p; }
    } catch { /* not executable */ }
  }
  return null;
}
