import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from '../lib/api.ts';
import { Button, Empty, ErrorNote, PageHeader, Panel, Select, Table, fmtTime } from '../components/ui.tsx';
import { Status } from '../components/status.tsx';

const FIELD_ORDER = ['companyName', 'legalName', 'legalForm', 'street', 'postalCode', 'city', 'phone', 'email', 'website', 'representatives', 'registerCourt', 'registerNumber', 'vatId', 'openingHours', 'services', 'serviceArea', 'industry'];

export function ResearchPanel({ customerId, data }: { customerId: string; data: any }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['research', customerId], queryFn: () => api(`/customers/${customerId}/research`) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('all');
  const run = useMutation({ mutationFn: () => post(`/customers/${customerId}/research`), onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', customerId] }) });
  const apply = useMutation({
    mutationFn: () => post(`/customers/${customerId}/facts/apply`, { factIds: [...selected] }),
    onSuccess: () => { setSelected(new Set()); qc.invalidateQueries({ queryKey: ['customer', customerId] }); },
  });
  const latestRun = data.researchRuns?.[0];
  const facts = useMemo(() => {
    const all = (data.facts ?? []).filter((f: any) => !latestRun || f.runId === latestRun.id);
    return all
      .filter((f: any) => filter === 'all' || f.status === filter)
      .sort((a: any, b: any) => (FIELD_ORDER.indexOf(a.field) + 1 || 99) - (FIELD_ORDER.indexOf(b.field) + 1 || 99) || a.field.localeCompare(b.field));
  }, [data.facts, filter, latestRun?.id]);
  const comp = detail.data?.competitors?.competitors ?? [];
  const existing = detail.data?.existingSite;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => run.mutate()} busy={run.isPending}>{latestRun ? 'Run research again' : 'Research company'}</Button>
        {run.data?.job && <Link className="text-[12px] text-accent" to={`/jobs/${run.data.job.id}`}>Follow job →</Link>}
        {latestRun && <span className="text-[12px] text-ink-3">Last run {fmtTime(latestRun.startedAt)} · <Status value={latestRun.status} /></span>}
        <div className="flex-1" />
        <Select className="w-40" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {['all', 'VERIFIED', 'LIKELY', 'UNVERIFIED', 'CONFLICT'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </Select>
        <Button onClick={() => apply.mutate()} disabled={!selected.size} busy={apply.isPending}>Apply {selected.size || ''} to profile</Button>
      </div>
      <ErrorNote error={run.error || apply.error} />
      {apply.data && <div className="text-[12px] text-ink-2">Applied: {apply.data.applied.join(', ') || 'nothing'}{apply.data.skipped.length ? ` · Skipped: ${apply.data.skipped.join('; ')}` : ''}</div>}
      {!facts.length ? (
        <Empty title={latestRun ? 'No facts for this filter' : 'No research yet'}>Research uses Claude Code web search plus a direct read of the official website and its Impressum. Every value carries its source URL, timestamp and confidence. Website content is treated as untrusted data.</Empty>
      ) : (
        <Panel title={`Facts · ${facts.length}`} pad={false}>
          <Table head={['', 'Field', 'Value', 'Status', 'Source', 'Confidence']}>
            {facts.map((f: any) => (
              <tr key={f.id} className={f.status === 'CONFLICT' ? 'bg-fail/5' : ''}>
                <td><input type="checkbox" aria-label={`select ${f.field}`} disabled={f.status === 'CONFLICT'} checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="accent-[var(--wf-accent)]" /></td>
                <td className="whitespace-nowrap font-mono text-[11.5px] text-ink-2">{f.field}</td>
                <td className="max-w-[340px]"><div>{f.value}</div>{f.quote && <div className="mt-0.5 truncate text-[11px] text-ink-3" title={f.quote}>“{f.quote}”</div>}{f.note && <div className="text-[11px] text-ink-3">{f.note}</div>}</td>
                <td><Status value={f.status} /></td>
                <td className="max-w-[240px]"><a href={f.sourceUrl} target="_blank" rel="noreferrer noopener" className="block truncate text-accent hover:underline">{f.sourceTitle || f.sourceUrl}</a><div className="text-[11px] text-ink-3">{f.provider} · {fmtTime(f.retrievedAt)}</div></td>
                <td className="font-mono text-ink-2">{Math.round(f.confidence * 100)}%</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
      {detail.data?.suspicious?.length > 0 && (
        <Panel title="Suspicious content (ignored instructions)">
          {detail.data.suspicious.map((s: any, i: number) => <div key={i} className="text-[12px]"><span className="text-warn">{s.url}</span> — {s.description}</div>)}
        </Panel>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {existing && (
          <Panel title="Existing website — observed behaviour">
            <div className="space-y-1 text-[12.5px]">
              <div><span className="text-ink-3">URL</span> <a className="text-accent" href={existing.url} target="_blank" rel="noreferrer noopener">{existing.url}</a></div>
              <div><span className="text-ink-3">Pages read</span> {existing.pages.length} · <span className="text-ink-3">Forms</span> {existing.forms}</div>
              <div><span className="text-ink-3">Fonts</span> {existing.fonts.join(', ') || '—'}</div>
              <div className="flex flex-wrap items-center gap-1"><span className="text-ink-3">Colors</span>{existing.colors.slice(0, 8).map((c: string) => <span key={c} title={c} className="inline-block size-4 rounded border hair" style={{ background: c }} />)}</div>
              <div><span className="text-ink-3">Impressum link</span> {existing.hasImpressumLink ? 'yes' : 'no'} · <span className="text-ink-3">Datenschutz link</span> {existing.hasDatenschutzLink ? 'yes' : 'no'} · <span className="text-ink-3">Consent tool</span> {existing.consentToolDetected || 'none detected'}</div>
              <div><span className="text-ink-3">Third parties before consent</span> {existing.thirdPartyOrigins.length ? existing.thirdPartyOrigins.join(', ') : 'none'}</div>
              {existing.notes.map((n: string) => <div key={n} className="text-warn">{n}</div>)}
              <div className="pt-1 text-[11.5px] text-ink-3">The old site is analysed, not assumed to be legally correct and never cloned.</div>
            </div>
          </Panel>
        )}
        {comp.length > 0 && (
          <Panel title={`Competitors · strategy only`}>
            <div className="space-y-3">
              {comp.map((c: any) => (
                <div key={c.url || c.name} className="text-[12.5px]">
                  <div className="font-medium">{c.name} <a className="font-normal text-accent" href={c.url} target="_blank" rel="noreferrer noopener">{c.url}</a></div>
                  <div className="text-ink-2">{c.positioning}</div>
                  {c.ctaPatterns?.length > 0 && <div className="text-[11.5px] text-ink-3">CTA: {c.ctaPatterns.join(' · ')}</div>}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export function Research() {
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api('/customers') });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api('/jobs') });
  const research = (jobs.data?.jobs ?? []).filter((j: any) => j.kind === 'research');
  return (
    <div className="fade-in">
      <PageHeader title="Research" subtitle="Company research runs with source provenance." />
      <div className="space-y-4 p-6">
        <Panel title="Customers" pad={false}>
          <Table head={['Company', 'Last research', 'State']}>
            {(customers.data?.customers ?? []).map((c: any) => {
              const j = research.find((x: any) => x.customerId === c.id);
              return (
                <tr key={c.id}>
                  <td><Link className="font-medium hover:text-accent" to={`/customers/${c.id}?tab=research`}>{c.marketing.companyName}</Link></td>
                  <td className="text-ink-3">{j ? <Link to={`/jobs/${j.id}`} className="hover:text-ink">{fmtTime(j.createdAt)}</Link> : 'never'}</td>
                  <td>{j ? <Status value={j.state} /> : <span className="text-ink-3">—</span>}</td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      </div>
    </div>
  );
}
