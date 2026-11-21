import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Empty, PageHeader, Panel, Table } from '../components/ui.tsx';
import { GateView, LegalAuditView } from '../views/Reports.tsx';

export function LegalOverview() {
  const sites = useQuery({ queryKey: ['websites'], queryFn: () => api('/websites') });
  const rules = useQuery({ queryKey: ['ruleset'], queryFn: () => api('/legal/ruleset') });
  const list = sites.data?.websites ?? [];
  const details = useQueries({ queries: list.map((w: any) => ({ queryKey: ['website', w.id], queryFn: () => api(`/websites/${w.id}`) })) });
  const rows = details.map((d) => d.data).filter(Boolean);
  return (
    <div className="fade-in">
      <PageHeader title="Legal & Privacy" subtitle="Technical checks against a sourced, versioned ruleset. No legal advice, no percentage scores, no guarantees." />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rows.length ? rows.map((d: any) => (
            <div key={d.website.id} className="space-y-3">
              <div className="text-[13px] font-medium"><Link className="hover:text-accent" to={`/websites/${d.website.id}?tab=legal`}>{d.customer.companyName} · {d.website.name}</Link></div>
              <GateView websiteId={d.website.id} gate={d.website.gate} />
              <Panel title="Legal audit"><LegalAuditView audit={d.legalAudit} /></Panel>
            </div>
          )) : <Empty title="No websites yet" />}
        </div>
        <Panel title={`Ruleset · ${rules.data?.version ?? '…'} · ${rules.data?.rules?.length ?? 0} rules`} pad={false}>
          {rules.data?.errors?.length > 0 && <div className="px-3 py-2 text-[12px] text-fail">{rules.data.errors.join('; ')}</div>}
          <Table head={['Rule', 'Category', 'Severity', 'Check', 'Reviewed', 'Source']}>
            {(rules.data?.rules ?? []).map((r: any) => (
              <tr key={r.id}><td><div>{r.title}</div><div className="font-mono text-[10.5px] text-ink-3">{r.id} · v{r.ruleVersion} · {r.jurisdiction}</div></td><td className="text-ink-2">{r.category}</td><td className="text-ink-2">{r.severity}</td><td className="font-mono text-[11px] text-ink-2">{r.checkId ?? '—'}{r.manual && <div className="font-sans text-manual">+ manual</div>}</td><td className="text-ink-3">{r.lastReviewed}</td><td className="max-w-[220px] truncate"><a className="text-accent" href={r.source} target="_blank" rel="noreferrer noopener">{r.source.replace(/^https?:\/\//, '')}</a></td></tr>
            ))}
          </Table>
        </Panel>
      </div>
    </div>
  );
}
