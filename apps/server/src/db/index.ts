import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DB_PATH } from '../config.ts';
import * as schema from './schema.ts';

export { schema };
export type DB = ReturnType<typeof drizzle<typeof schema>>;

let instance: { db: DB; sqlite: Database.Database } | null = null;

/**
 * Opens the SQLite database and applies pending migrations.
 * All persistence goes through Drizzle so the dialect can later be swapped for PostgreSQL.
 */
export function openDb(path = DB_PATH): { db: DB; sqlite: Database.Database } {
  if (instance) return instance;
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(import.meta.dirname, 'migrations') });
  instance = { db, sqlite };
  return instance;
}

export function db(): DB {
  return openDb().db;
}

export function closeDb(): void {
  instance?.sqlite.close();
  instance = null;
}
