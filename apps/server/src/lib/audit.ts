import { db, schema } from '../db/index.ts';
import { now, redact } from './util.ts';

/** Append-only audit trail for everything that touches agents, files or legal state. */
export function audit(actor: string, action: string, target = '', detail: unknown = null): void {
  const safe = detail === null ? null : JSON.parse(redact(JSON.stringify(detail)));
  db().insert(schema.auditLog).values({ at: now(), actor, action, target, detail: safe }).run();
}
