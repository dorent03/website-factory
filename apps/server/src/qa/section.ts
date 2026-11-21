import { worstStatus, type CheckStatus, type QAFinding, type QASection } from '@wf/shared';

export function section(key: string, label: string, started: number, findings: QAFinding[], opts: { summary?: string; metrics?: QASection['metrics']; artifacts?: string[]; status?: CheckStatus } = {}): QASection {
  const statusOf = (f: QAFinding): CheckStatus => (f.severity === 'critical' || f.severity === 'major' ? 'FAIL' : f.severity === 'minor' ? 'WARNING' : 'PASS');
  const status = opts.status ?? (findings.length ? worstStatus(findings.map(statusOf)) : 'PASS');
  return {
    key, label, status, findings, metrics: opts.metrics ?? {}, artifacts: opts.artifacts ?? [], ranAt: new Date().toISOString(), durationMs: Date.now() - started,
    summary: opts.summary ?? (findings.length ? `${findings.length} finding(s)` : 'No issues found'),
  };
}

export const f = (severity: QAFinding['severity'], message: string, extra: Partial<QAFinding> = {}): QAFinding => ({ severity, message, page: '', viewport: '', selector: '', evidence: '', ruleId: '', ...extra });
