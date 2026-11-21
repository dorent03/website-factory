import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '../lib/api.ts';
import { Button, Empty, ErrorNote, Field, Input, Panel, Table, Textarea, fmtTime } from '../components/ui.tsx';
import { LeaderRow, Status } from '../components/status.tsx';

export function QAReportView({ qa }: { qa: any }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!qa) return <Empty title="No QA report yet">Run Full QA to measure responsive behaviour, accessibility, SEO, Lighthouse performance, security, links, forms and console errors in a real browser.</Empty>;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] text-ink-3"><span>Version {qa.websiteVersion} · {fmtTime(qa.finishedAt)}</span><Status value={qa.overall} /></div>
      {qa.sections.map((s: any) => (
        <div key={s.key} className="border-b hair last:border-0">
          <button className="w-full text-left" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}>
            <LeaderRow label={s.label} sub={open === s.key ? undefined : s.summary}><Status value={s.status} /></LeaderRow>
          </button>
          {open === s.key && (
            <div className="mb-2 rounded-md bg-sunken/60 p-2 text-[12px]">
              <div className="mb-1 text-ink-2">{s.summary}</div>
              {Object.keys(s.metrics ?? {}).length > 0 && <div className="mb-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-ink-3">{Object.entries(s.metrics).map(([k, v]) => <span key={k}>{k}: {String(v)}</span>)}</div>}
              {s.findings.length ? s.findings.slice(0, 40).map((f: any, i: number) => (
                <div key={i} className="border-t hair py-1"><span className={f.severity === 'critical' || f.severity === 'major' ? 'text-fail' : f.severity === 'minor' ? 'text-warn' : 'text-ink-3'}>{f.severity}</span> {f.message}{f.page && <span className="text-ink-3"> · {f.page}</span>}{f.viewport && <span className="text-ink-3"> · {f.viewport}</span>}{f.evidence && <div className="truncate font-mono text-[11px] text-ink-3" title={f.evidence}>{f.evidence}</div>}</div>
              )) : <div className="text-ink-3">No findings.</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function LegalAuditView({ audit }: { audit: any }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!audit) return <Empty title="No legal audit yet">The legal audit checks Impressum, Datenschutz, inventory, consent, third parties, fonts, forms, company-data consistency, legal links and asset rights against the sourced ruleset.</Empty>;
  return (
    <div>
      <div className="mb-2 text-[12px] text-ink-3">Version {audit.websiteVersion} · ruleset <span className="font-mono">{audit.rulesetVersion}</span> · inventory v{audit.inventoryVersion} · {fmtTime(audit.generatedAt)}</div>
      {audit.sections.map((s: any) => (
        <div key={s.key} className="border-b hair last:border-0">
          <button className="w-full text-left" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}><LeaderRow label={s.label}><Status value={s.status} /></LeaderRow></button>
          {open === s.key && (
            <div className="mb-2 rounded-md bg-sunken/60 p-2 text-[12px]">
              {s.findings.length ? s.findings.map((f: any, i: number) => (
                <div key={i} className="border-t hair py-1 first:border-0"><Status value={f.status} className="mr-2" />{f.message}{f.evidence && <span className="text-ink-3"> · {f.evidence}</span>}<div className="font-mono text-[10.5px] text-ink-3">{f.ruleId}{f.sourceUrl && <> · <a className="hover:text-ink" href={f.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>}</div></div>
              )) : <div className="text-ink-3">Not applicable to this website.</div>}
            </div>
          )}
        </div>
      ))}
      <div className="mt-3 flex items-baseline justify-between border-t hair pt-2"><span className="text-[12.5px] font-medium">Overall</span><Status value={audit.overall} /></div>
      {audit.manualReview?.length > 0 && <details className="mt-2 text-[12px]"><summary className="cursor-pointer text-manual">MANUAL REVIEW REQUIRED · {audit.manualReview.length}</summary><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">{audit.manualReview.map((m: string) => <li key={m}>{m}</li>)}</ul></details>}
      <p className="mt-3 text-[11px] text-ink-3">{audit.disclaimer}</p>
    </div>
  );
}

export function InventoryView({ inv }: { inv: any }) {
  if (!inv) return <Empty title="No privacy inventory yet">The inventory is measured in a fresh browser: every network request, cookie, localStorage and sessionStorage key — compared with the source and the Datenschutzerklärung.</Empty>;
  return (
    <div className="space-y-3">
      <div className="text-[12px] text-ink-3">Inventory v{inv.version} · website {inv.websiteVersion} · {fmtTime(inv.generatedAt)} · consent {inv.consentRequired ? <span className="text-warn">required</span> : 'not required'}</div>
      <Table head={['Service', 'Provider', 'Loaded', 'Before consent', 'Privacy section', 'Status']}>
        {inv.services.map((s: any) => (
          <tr key={s.id}>
            <td><div className="font-medium">{s.service}</div><div className="text-[11px] text-ink-3">{s.category} · {s.purpose}</div>{s.notes.map((n: string) => <div key={n} className="text-[11px] text-warn">{n}</div>)}</td>
            <td className="text-ink-2">{s.provider}</td>
            <td className="text-ink-2">{s.loading}</td>
            <td className={s.requestBeforeConsent ? 'text-fail' : 'text-ink-2'}>{s.requestBeforeConsent === null ? '—' : s.requestBeforeConsent ? 'YES' : 'NO'}</td>
            <td>{s.privacySectionKey ? (s.privacySectionPresent ? 'YES' : <span className="text-fail">NO</span>) : '—'}</td>
            <td><Status value={s.status} /></td>
          </tr>
        ))}
      </Table>
      <div className="grid grid-cols-1 gap-3 text-[12px] md:grid-cols-3">
        <div><div className="label mb-1">Cookies (no consent)</div>{inv.cookies.length ? inv.cookies.map((c: any) => <div key={c.name} className="font-mono">{c.name} <span className="text-ink-3">{c.domain} · {c.category}</span></div>) : <div className="text-ink-3">none</div>}</div>
        <div><div className="label mb-1">localStorage</div>{inv.localStorage.length ? inv.localStorage.map((c: any) => <div key={c.name} className="font-mono">{c.name} <span className="text-ink-3">{c.category}</span></div>) : <div className="text-ink-3">none</div>}</div>
        <div><div className="label mb-1">sessionStorage</div>{inv.sessionStorage.length ? inv.sessionStorage.map((c: any) => <div key={c.name} className="font-mono">{c.name}</div>) : <div className="text-ink-3">none</div>}</div>
      </div>
      <div className="text-[12px]"><span className="label mr-2">Third-party requests (first visit)</span>{inv.requests.filter((r: any) => !r.firstParty).length || 'none'} · <span className="label mx-2">Undeclared</span>{inv.undeclaredOrigins.length ? <span className="text-fail">{inv.undeclaredOrigins.join(', ')}</span> : 'none'}</div>
    </div>
  );
}

export function ConsentView({ consent }: { consent: any }) {
  const r = consent?.testResults;
  if (!r) return <div className="text-[12px] text-ink-3">Consent tests not run yet.</div>;
  if (!r.required) return <div className="text-[12.5px]"><LeaderRow label="Consent"><span className="font-mono text-[11px] font-semibold text-pass">NOT REQUIRED / PASS</span></LeaderRow>{r.checks.map((c: any) => <div key={c.check} className="text-[12px] text-ink-2">{c.detail}</div>)}</div>;
  return (
    <div>
      {r.runs.map((run: any) => <LeaderRow key={run.state} label={run.state} sub={run.violations.slice(0, 3).join(' · ') || `${run.requests.filter((x: any) => !x.firstParty).length} third-party requests · ${run.localStorage.length} storage keys`}><Status value={run.status} /></LeaderRow>)}
      {r.checks.map((c: any) => <LeaderRow key={c.check} label={c.check} sub={c.detail}><Status value={c.status} /></LeaderRow>)}
    </div>
  );
}

export function GateView({ websiteId, gate }: { websiteId: string; gate: any }) {
  const qc = useQueryClient();
  const [by, setBy] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const evalGate = useMutation({ mutationFn: () => post(`/websites/${websiteId}/gate`), onSuccess: () => qc.invalidateQueries({ queryKey: ['website', websiteId] }) });
  const sign = useMutation({ mutationFn: () => post(`/websites/${websiteId}/signoff`, { by, note, confirmManualReview: true }), onSuccess: () => qc.invalidateQueries({ queryKey: ['website', websiteId] }) });
  return (
    <Panel title="Production gate" actions={<Button size="sm" onClick={() => evalGate.mutate()} busy={evalGate.isPending}>Re-evaluate</Button>}>
      <div className="mb-2 flex items-center justify-between"><Status value={gate?.state ?? 'NOT_EVALUATED'} className="text-[12px]" />{gate?.evaluatedAt && <span className="text-[11px] text-ink-3">{gate.websiteVersion} · {fmtTime(gate.evaluatedAt)}</span>}</div>
      {gate?.reasons?.length > 0 && <ul className="mb-2 space-y-1 text-[12px]">{gate.reasons.map((r: any, i: number) => <li key={i} className="text-fail">• {r.message} <span className="font-mono text-[10.5px] text-ink-3">{r.source}</span></li>)}</ul>}
      {gate?.manualReview?.length > 0 && <details className="mb-2 text-[12px]"><summary className="cursor-pointer text-manual">Manual review · {gate.manualReview.length} item(s)</summary><ul className="mt-1 list-disc pl-4 text-ink-2">{gate.manualReview.map((m: string) => <li key={m}>{m}</li>)}</ul></details>}
      {gate?.state === 'READY_FOR_HUMAN_REVIEW' && (
        <div className="mt-2 space-y-2 border-t hair pt-2">
          <Field label="Reviewed by"><Input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name" /></Field>
          <Field label="Review note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. legal texts reviewed by …, asset rights confirmed" /></Field>
          <label className="flex items-start gap-2 text-[12px]"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 accent-[var(--wf-accent)]" />I have completed the manual review items listed above. This is a technical release decision, not a legal guarantee.</label>
          <Button variant="primary" disabled={!confirm || by.trim().length < 2} onClick={() => sign.mutate()} busy={sign.isPending}>Mark ready for production</Button>
        </div>
      )}
      {gate?.state === 'READY_FOR_PRODUCTION' && <div className="text-[12px] text-ink-2">Signed off by {gate.signedOffBy}{gate.signOffNote ? ` — ${gate.signOffNote}` : ''}</div>}
      <ErrorNote error={evalGate.error || sign.error} />
    </Panel>
  );
}
