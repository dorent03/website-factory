import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import type { LegalAudit, PrivacyInventory, ProductionGate, QAReport } from '@wf/shared';
import { db, schema } from '../db/index.ts';
import { audit as auditLog } from '../lib/audit.ts';
import { now, writeJson } from '../lib/util.ts';
import { siteContext } from '../pipeline/context.ts';
import { updateWebsite } from '../storage/websites.ts';

const latest = <T>(rows: Array<{ createdAt: string; data: unknown }>): T | null => (rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.data as T) ?? null;

/**
 * Production gate. READY_FOR_PRODUCTION is never set automatically — only by a human sign-off on a
 * version that passed. Every blocking reason is listed explicitly.
 */
export function evaluateGate(websiteId: string): ProductionGate {
  const sc = siteContext(websiteId);
  const version = sc.site.currentVersion ?? '';
  const qa = latest<QAReport>(db().select().from(schema.qaReports).where(eq(schema.qaReports.websiteId, websiteId)).all());
  const la = latest<LegalAudit>(db().select().from(schema.legalAudits).where(eq(schema.legalAudits.websiteId, websiteId)).all());
  const inv = (db().select().from(schema.privacyInventories).where(eq(schema.privacyInventories.websiteId, websiteId)).all().sort((a, b) => b.version - a.version)[0]?.data ?? null) as PrivacyInventory | null;
  const reasons: ProductionGate['reasons'] = [];
  const add = (code: string, message: string, source: string) => reasons.push({ code, message, source });
  if (!version) add('no-version', 'Website has no version yet', 'versions');
  if (sc.site.staleness?.stale) add('stale', `Compliance state invalidated since ${sc.site.staleness.since}: ${sc.site.staleness.reasons.slice(-3).join('; ')} — rerun privacy & legal audit`, 'impact-analysis');
  if (!qa || qa.websiteVersion !== version) add('qa-missing', 'QA has not run on the current version', 'qa');
  if (!la || la.websiteVersion !== version) add('legal-missing', 'Legal audit has not run on the current version', 'legal');
  if (!inv || inv.websiteVersion !== version) add('inventory-missing', 'Privacy inventory is not from the current version', 'privacy');
  const sec = (k: string) => qa?.sections.find((s) => s.key === k);
  if (qa && qa.websiteVersion === version) {
    for (const [k, code, label] of [['console', 'runtime-errors', 'Runtime errors'], ['forms', 'broken-forms', 'Broken forms'], ['accessibility', 'a11y-critical', 'Critical accessibility issues'], ['security', 'security-critical', 'Critical security issues'], ['links', 'broken-links', 'Broken links'], ['consent', 'premature-consent', 'Consent-dependent content loads prematurely / consent broken'], ['privacy', 'privacy-fail', 'Privacy inventory failures'], ['responsive', 'responsive-fail', 'Responsive failures']] as const) {
      const s = sec(k);
      if (s?.status === 'FAIL') add(code, `${label}: ${s.findings.filter((f) => f.severity === 'critical' || f.severity === 'major').slice(0, 3).map((f) => f.message).join(' · ') || s.summary}`, `qa.${k}`);
      if (!s || s.status === 'NOT_RUN') add(`${k}-not-run`, `${label.split(':')[0]} check not run`, `qa.${k}`);
    }
  }
  if (inv && inv.undeclaredOrigins.length) add('undeclared-tracking', `Undeclared third-party connections: ${inv.undeclaredOrigins.join(', ')}`, 'privacy');
  if (la && la.websiteVersion === version) {
    for (const s of la.sections) for (const f of s.findings) if (f.status === 'FAIL') add(`legal:${f.ruleId}`, f.message, `legal.${s.key}`);
  }
  const manual = [...(la?.manualReview ?? []), ...(qa?.sections.filter((s) => s.status === 'MANUAL_REVIEW').map((s) => `${s.label}: ${s.summary}`) ?? [])];
  const prev = sc.site.gate as ProductionGate | null;
  const signedOff = prev?.state === 'READY_FOR_PRODUCTION' && prev.websiteVersion === version && reasons.length === 0;
  const gate: ProductionGate = {
    state: reasons.length ? 'BLOCKED' : signedOff ? 'READY_FOR_PRODUCTION' : 'READY_FOR_HUMAN_REVIEW',
    reasons: [...new Map(reasons.map((r) => [r.code + r.message, r])).values()],
    manualReview: [...new Set(manual)], evaluatedAt: now(), websiteVersion: version,
    signedOffBy: signedOff ? prev!.signedOffBy : '', signOffNote: signedOff ? prev!.signOffNote : '',
  };
  updateWebsite(websiteId, { gate, status: gate.state === 'BLOCKED' ? 'blocked' : gate.state === 'READY_FOR_PRODUCTION' ? 'ready' : 'review' });
  writeJson(join(sc.paths.qa, 'production-gate.json'), gate);
  return gate;
}

export function signOff(websiteId: string, by: string, note: string): ProductionGate {
  const gate = evaluateGate(websiteId);
  if (gate.state === 'BLOCKED') throw Object.assign(new Error(`Cannot sign off: ${gate.reasons.length} blocking reason(s)`), { statusCode: 409 });
  const signed: ProductionGate = { ...gate, state: 'READY_FOR_PRODUCTION', signedOffBy: by.slice(0, 80) || 'Factory user', signOffNote: note.slice(0, 1000), evaluatedAt: now() };
  updateWebsite(websiteId, { gate: signed, status: 'ready' });
  auditLog('user', 'gate.signoff', websiteId, { version: gate.websiteVersion, by, manualReviewItems: gate.manualReview.length });
  return signed;
}
